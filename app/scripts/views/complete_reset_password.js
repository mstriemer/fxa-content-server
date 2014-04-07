/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'underscore',
  'views/base',
  'views/form',
  'stache!templates/complete_reset_password',
  'lib/session',
  'lib/password-mixin'
],
function (_, BaseView, FormView, Template, Session, PasswordMixin) {
  var t = BaseView.t;

  var View = FormView.extend({
    template: Template,
    className: 'complete_reset_password',

    events: {
      'change .show-password': 'onPasswordVisibilityChange'
    },

    // beforeRender is asynchronous and returns a promise. Only render
    // after beforeRender has finished its business.
    beforeRender: function () {
      this._isLinkDamaged = false;
      try {
        this.importSearchParam('token');
        this.importSearchParam('code');
        this.importSearchParam('email');
      } catch(e) {
        // the template will print the title and error, the rest
        // of the form will be blank.
        this._isLinkDamaged = true;
        return true;
      }

      var self = this;
      return this.fxaClient.isPasswordResetComplete(this.token)
         .then(function (isComplete) {
            self._isLinkExpired = isComplete;
            return true;
          });
    },

    context: function () {
      return {
        isSync: Session.service === 'sync',
        // If the link is invalid, print a special error message.
        isLinkDamaged: this._isLinkDamaged,
        isLinkExpired: this._isLinkExpired,
        isLinkValid: !(this._isLinkDamaged || this._isLinkExpired)
      };
    },

    isValidEnd: function () {
      return this._getPassword() === this._getVPassword();
    },

    showValidationErrorsEnd: function () {
      if (this._getPassword() !== this._getVPassword()) {
        this.displayError(t('Passwords do not match'));
      }
    },

    submit: function () {
      var password = this._getPassword();

      var self = this;
      return this.fxaClient.completePasswordReset(this.email, password, this.token, this.code)
          .then(function () {
            self.navigate('reset_password_complete');
          });
    },

    _getPassword: function () {
      return this.$('#password').val();
    },

    _getVPassword: function () {
      return this.$('#vpassword').val();
    }
  });

  _.extend(View.prototype, PasswordMixin);

  return View;
});
