/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'underscore',
  'views/form',
  'views/base',
  'stache!templates/complete_sign_up',
  'lib/auth-errors',
  'lib/validate',
  'lib/session',
  'views/mixins/resend-mixin',
  'views/mixins/service-mixin',
  'views/mixins/password-mixin',
  'views/decorators/notify_delayed_request',
  'views/decorators/allow_only_one_submit'
],
function (_, FormView, BaseView, CompleteSignUpTemplate, AuthErrors,
      Validate, Session, ResendMixin, ServiceMixin, PasswordMixin,
      notifyDelayedRequest, allowOnlyOneSubmit) {
  var CompleteSignUpView = FormView.extend({
    template: CompleteSignUpTemplate,
    className: 'complete_sign_up',

    events: {
      'change .show-password': 'onPasswordVisibilityChange',
      'click #resend': 'resend'
    },

    _importSearchParam: function (paramName) {
      // Remove any spaces that are probably due to a MUA adding
      // line breaks in the middle of the link.
      this.importSearchParam(paramName);
      this[paramName].replace(/ /g, '');
    },

    beforeRender: function () {
      try {
        this._importSearchParam('uid');
        this._importSearchParam('code');
      } catch(e) {
        this.logEvent('complete_sign_up.link_damaged');
        // This is an invalid link. Abort and show an error message
        // before doing any more checks.
        return true;
      }

      if (! this._doesLinkValidate()) {
        // One or more parameters fails validation. Abort and show an
        // error message before doing any more checks.
        this.logEvent('complete_sign_up.link_damaged');
        return true;
      }

      var self = this;

      return this.fxaClient.verifyCode(this.uid, this.code)
          .then(function () {
            // If the user completes the oauth email verification in
            // a second client and all of the necessary parameters are
            // available to generate an assertion, the user must sign in
            // verify their password before an assertion can be generated.
            // Show the screen.
            if (self.isOAuthDifferentBrowser() &&
                self.relier.canResume()) {
              return;
            }

            // if the user is here, they are verifying in the same browser OR
            // it's not an oauth flow and the user should see the "signup
            // complete" screen immediately OR the `resume` token was munged
            // and the user cannot continue the OAuth flow in this browser but
            // should see a "signup complete!" message anyways.
            self.navigate('signup_complete');
            return false;
          })
          .then(null, function (err) {
            if (AuthErrors.is(err, 'UNKNOWN_ACCOUNT')) {
              self._isLinkExpired = true;
              self.logEvent('complete_sign_up.link_expired');
            } else if (AuthErrors.is(err, 'INVALID_VERIFICATION_CODE') ||
                AuthErrors.is(err, 'INVALID_PARAMETER')) {
              // These errors show a link damaged screen
              self._isLinkDamaged = true;
              self.logEvent('complete_sign_up.link_damaged');
            } else {
              // all other errors show the standard error box.
              self._error = self.translateError(err);
            }
            return true;
          });
    },

    _doesLinkValidate: function () {
      return Validate.isUidValid(this.uid) &&
             Validate.isCodeValid(this.code) &&
             ! this._isLinkDamaged;
    },

    context: function () {
      var doesLinkValidate = this._doesLinkValidate();
      var isLinkExpired = this._isLinkExpired;
      // This is only the case if you've signed up in the same browser
      // you opened the verification link in.
      var canResend = !!Session.sessionToken;
      var isOAuthDifferentBrowser = this.isOAuthDifferentBrowser();
      var email = this.relier.get('email');

      return {
        // If the link is invalid, print a special error message.
        isLinkDamaged: ! doesLinkValidate,
        isLinkExpired: isLinkExpired,
        canResend: canResend,
        isOAuthDifferentBrowser: isOAuthDifferentBrowser,
        email: email,
        error: this._error
      };
    },

    // for users who verify in a second client and must enter their password
    submit: function () {
      var self = this;
      var email = self.relier.get('email');
      var password = self.$('.password').val();

      return self.fxaClient.signIn(email, password)
          .then(function () {
            self.navigate('signup_complete');
          });
    },

    // This is called when a user follows an expired verification link
    // and clicks the "Resend" link.
    resend: BaseView.preventDefaultThen(allowOnlyOneSubmit(notifyDelayedRequest(function () {
      var self = this;

      self.logEvent('complete_sign_up.resend');
      return this.fxaClient.signUpResend()
              .then(function () {
                self.displaySuccess();
              }, function (err) {
                if (AuthErrors.is(err, 'INVALID_TOKEN')) {
                  return self.navigate('signup', {
                    error: err
                  });
                }

                // unexpected error, rethrow for display.
                throw err;
              });
    })))
  });

  _.extend(CompleteSignUpView.prototype, ResendMixin, ServiceMixin,
            PasswordMixin);

  return CompleteSignUpView;
});
