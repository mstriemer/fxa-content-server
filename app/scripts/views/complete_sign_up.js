/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'underscore',
  'views/form',
  'views/base',
  'stache!templates/complete_sign_up',
  'lib/fxa-client',
  'lib/auth-errors'
],
function (_, FormView, BaseView, CompleteSignUpTemplate, FxaClient, authErrors) {
  var CompleteSignUpView = FormView.extend({
    template: CompleteSignUpTemplate,
    className: 'complete_sign_up',

    beforeRender: function () {
      this._isLinkDamaged = false;
      try {
        this.importSearchParam('uid');
        this.importSearchParam('code');
      } catch(e) {
        // the template will print the title and error, the rest
        // of the form will be blank.
        this._isLinkDamaged = true;
        return true;
      }

      var self = this;
      return this.fxaClient.verifyCode(this.uid, this.code)
          .then(function () {
            self.navigate('signup_complete');
            return false;
          })
          .then(null, function (err) {
            if (authErrors.is(err, 'INVALID_PARAMETER')) {
              self._isLinkDamaged = true;
            } else {
              self._error = self.translateError(err);
            }
          });
    },

    context: function () {
      return {
        // If the link is invalid, print a special error message.
        isLinkDamaged: this._isLinkDamaged,
        error: this._error
      };
    }
  });

  return CompleteSignUpView;
});
