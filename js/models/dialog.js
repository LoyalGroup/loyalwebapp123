/*
 * Q-municate chat application
 *
 * Dialog Module
 *
 */

module.exports = Dialog;

function Dialog(app) {
  this.app = app;
}

Dialog.prototype = {

  download: function(callback) {
    var QBApiCalls = this.app.service;

    QBApiCalls.listDialogs({sort_desc: 'last_message_date_sent'}, function(dialogs) {
      callback(dialogs);
    });
  },

  create: function(params) {
    var User = this.app.models.User,
        // exclude current user from dialog occupants that he doesn't hit to yourself in Contact List
        occupants_ids = _.without(params.occupants_ids, User.contact.id);

    return {
      id: params._id,
      type: params.type,
      room_jid: params.xmpp_room_jid || null,
      room_name: params.name || null,
      occupants_ids: occupants_ids,
      last_message_date_sent: params.last_message_date_sent || null,
      unread_count: params.unread_messages_count || ''
    };
  },

  createPrivate: function(jid) {
    var QBApiCalls = this.app.service,
        DialogView = this.app.views.Dialog,        
        ContactList = this.app.models.ContactList,
        User = this.app.models.User,
        id = QB.chat.helpers.getIdFromNode(jid),
        self = this,
        dialog;

    QBApiCalls.createDialog({type: 3, occupants_ids: id}, function(res) {
      dialog = self.create(res);
      ContactList.dialogs[dialog.id] = dialog;
      if (QMCONFIG.debug) console.log('Dialog', dialog);

      if (!localStorage['QM.dialog-' + dialog.id]) {
        localStorage.setItem('QM.dialog-' + dialog.id, JSON.stringify({ messages: [] }));
      }

      // send notification about subscribe
      QB.chat.send(jid, {type: 'chat', extension: {
        save_to_history: 1,
        dialog_id: dialog.id,
        date_sent: Math.floor(Date.now() / 1000),

        notification_type: '3',
        full_name: User.contact.full_name,
      }});

      ContactList.add(dialog.occupants_ids, null, function() {
        DialogView.addDialogItem(dialog);
      });
    });
  },

  createGroup: function(occupants_names, params, callback) {
    var QBApiCalls = this.app.service,
        DialogView = this.app.views.Dialog,        
        ContactList = this.app.models.ContactList,
        contacts = ContactList.contacts,
        User = this.app.models.User,
        self = this,
        dialog;

    QBApiCalls.createDialog(params, function(res) {
      dialog = self.create(res);
      ContactList.dialogs[dialog.id] = dialog;
      if (QMCONFIG.debug) console.log('Dialog', dialog);

      if (!localStorage['QM.dialog-' + dialog.id]) {
        localStorage.setItem('QM.dialog-' + dialog.id, JSON.stringify({ messages: [] }));
      }

      QB.chat.muc.join(dialog.room_jid, function() {
        var msgId = QB.chat.helpers.getUniqueId();
        
        QB.chat.addListener({name: 'message', type: 'groupchat', id: msgId}, function() {
          DialogView.addDialogItem(dialog);
          callback(dialog);

          // send notifications about adding people
          for (var i = 0, len = dialog.occupants_ids.length, id; i < len; i++) {
            id = dialog.occupants_ids[i];
            QB.chat.send(contacts[id].user_jid, {type: 'chat', extension: {
              dialog_id: dialog.id,
              date_sent: Math.floor(Date.now() / 1000),

              notification_type: '1',
              full_name: User.contact.full_name,
              room_jid: dialog.room_jid,
              room_name: dialog.room_name,
              occupants_ids: res.occupants_ids.join()
            }});
          }
        });

        // send notification about creating room
        QB.chat.send(dialog.room_jid, {id: msgId, type: 'groupchat', body: occupants_names, extension: {
          save_to_history: 1,
          dialog_id: dialog.id,
          date_sent: Math.floor(Date.now() / 1000),

          notification_type: '1',
          full_name: User.contact.full_name
        }});
        
      });

    });
  },

  updateGroup: function(occupants_names, params, callback) {
    var QBApiCalls = this.app.service,
        DialogView = this.app.views.Dialog,
        ContactList = this.app.models.ContactList,
        contacts = ContactList.contacts,
        User = this.app.models.User,
        self = this,
        dialog;

    QBApiCalls.updateDialog(params.dialog_id, {push_all: {occupants_ids: [params.occupants_ids]}}, function(res) {
      dialog = self.create(res);
      ContactList.dialogs[params.dialog_id] = dialog;
      if (QMCONFIG.debug) console.log('Dialog', dialog);

      var msgId = QB.chat.helpers.getUniqueId();
      
      QB.chat.addListener({name: 'message', type: 'groupchat', id: msgId}, function() {
        callback(dialog);

        // send notifications about adding people
        for (var i = 0, len = params.new_ids.length, id; i < len; i++) {
          id = params.new_ids[i];
          QB.chat.send(contacts[id].user_jid, {type: 'chat', extension: {
            dialog_id: dialog.id,
            date_sent: Math.floor(Date.now() / 1000),

            notification_type: '1',
            full_name: User.contact.full_name,
            room_jid: dialog.room_jid,
            room_name: dialog.room_name,
            occupants_ids: res.occupants_ids.join()
          }});
        }
      });

      // send notification about updating room
      QB.chat.send(dialog.room_jid, {id: msgId, type: 'groupchat', body: occupants_names, extension: {
        save_to_history: 1,
        dialog_id: dialog.id,
        date_sent: Math.floor(Date.now() / 1000),

        notification_type: '2',
        full_name: User.contact.full_name,
        occupants_ids: dialog.occupants_ids.join(),
      }});

    });
  },

  leaveChat: function(dialog, callback) {
    var QBApiCalls = this.app.service,
        User = this.app.models.User,
        self = this;

    // send notification about leave
    QB.chat.send(dialog.room_jid, {type: 'groupchat', extension: {
      save_to_history: 1,
      dialog_id: dialog.id,
      date_sent: Math.floor(Date.now() / 1000),

      notification_type: '6',
      full_name: User.contact.full_name,
    }});

    QB.chat.muc.leave(dialog.room_jid, function() {
      QBApiCalls.updateDialog(dialog.id, {pull_all: {occupants_ids: [User.contact.id]}}, function() {});
    });
    
    callback();
  }

};
