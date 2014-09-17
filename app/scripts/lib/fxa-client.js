/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// a very light wrapper around the real FxaClient to reduce boilerplate code
// and to allow us to develop to features that are not yet present in the real
// client.

'use strict';

define([
  'underscore',
  'fxaClient',
  'jquery',
  'lib/promise',
  'lib/session',
  'lib/auth-errors',
  'lib/constants',
  'lib/channels'
],
function (_, FxaClient, $, p, Session, AuthErrors, Constants, Channels) {
  // IE 8 doesn't support String.prototype.trim
  function trim(str) {
    return str && str.replace(/^\s+|\s+$/g, '');
  }

  function FxaClientWrapper(options) {
    options = options || {};

    this._client = options.client;
    this._signUpResendCount = 0;
    this._passwordResetResendCount = 0;
    this._channel = options.channel;
    this._relier = options.relier;
  }

  FxaClientWrapper.prototype = {
    // If there exists a channel, this will send a message over the channel to determine
    // whether we should cancel the login to sync or not based on Desktop specific
    // checks and dialogs. It throws an error with message='USER_CANCELED_LOGIN' and
    // errno=1001 if that's the case.
    _checkForDesktopSyncRelinkWarning: function (email) {
      return Channels.sendExpectResponse('can_link_account', { email: email }, {
        // A testing channel that was passed in on client creation. If no
        // channel is sent, the appropriate one will be created.
        channel: this._channel
      }).then(function (response) {
        if (response && response.data && ! response.data.ok) {
          throw AuthErrors.toError('USER_CANCELED_LOGIN');
        }
      }, function (err) {
        console.error('_checkForDesktopSyncRelinkWarning failed with', err);
        // If the browser doesn't implement this command, then it will handle
        // prompting the relink warning after sign in completes. This can likely
        // be changed to 'reject' after Fx31 hits nightly, because all browsers
        // will likely support 'can_link_account'
      });
    },

    _getClientAsync: function () {
      var defer = p.defer();

      if (this._client) {
        defer.resolve(this._client);
      } else {
        var self = this;
        this._getFxAccountUrl()
          .then(function (fxaccountUrl) {
            self._client = new FxaClient(fxaccountUrl);
            defer.resolve(self._client);
          });
      }

      // Protip: add `.delay(msToDelay)` to do a dirty
      // synthication of server lag for manual testing.
      return defer.promise;
    },

    _getFxAccountUrl: function() {
      if (Session.config && Session.config.fxaccountUrl) {
        return p(Session.config.fxaccountUrl);
      }

      return p.jQueryXHR($.getJSON('/config'))
          .then(function (data) {
            return data.fxaccountUrl;
          });
    },

    /**
     * Fetch some entropy from the server
     */
    getRandomBytes: function () {
      return this._getClientAsync()
        .then(function (client) {
          return client.getRandomBytes();
        });
    },

    /**
     * Check the user's current password without affecting session state.
     */
    checkPassword: function (email, password) {
      return this._getClientAsync()
          .then(function (client) {
            return client.signIn(email, password);
          });
    },

    signIn: function (originalEmail, password, options) {
      var email = trim(originalEmail);
      var self = this;
      options = options || {};

      return p().then(function() {
        // If we already verified in signUp that we can link with
        // the desktop, don't do it again. Otherwise,
        // make the call over to the Desktop code to ask if
        // we can allow the linking.
        if (!options.verifiedCanLinkAccount) {
          return self._checkForDesktopSyncRelinkWarning(email);
        }
        return;
      })
      .then(_.bind(self._getClientAsync, self))
      .then(function (client) {
        return client.signIn(email, password, { keys: true });
      })
      .then(function (accountData) {
        var cachedCredentials = Session.cachedCredentials;
        // get rid of any old data.
        Session.clear();

        var updatedSessionData = {
          email: email,
          uid: accountData.uid,
          sessionToken: accountData.sessionToken,
          sessionTokenContext: self._relier.get('context')
        };

        if (self._relier.isFxDesktop()) {
          updatedSessionData.unwrapBKey = accountData.unwrapBKey;
          updatedSessionData.keyFetchToken = accountData.keyFetchToken;
          updatedSessionData.customizeSync = options.customizeSync;
          updatedSessionData.cachedCredentials = {
            email: email,
            uid: accountData.uid,
            sessionToken: accountData.sessionToken,
            sessionTokenContext: self._relier.get('context')
          };
        } else {
          // Carry over the old cached credentials
          updatedSessionData.cachedCredentials = cachedCredentials;
        }

        Session.set(updatedSessionData);
        // Skipping the relink warning is only relevant to the channel
        // communication with the Desktop browser. It may have been
        // done during a sign up flow.
        updatedSessionData.verifiedCanLinkAccount = true;

        return Channels.sendExpectResponse('login', updatedSessionData, {
          channel: self._channel
        }).then(function () {
          return accountData;
        }, function (err) {
          // We ignore this error unless the service is set to Sync.
          // This allows us to tests flows with the desktop context
          // without things blowing up. In production/reality,
          // the context is set to desktop iff service is Sync.
          if (self._relier.isSync()) {
            throw err;
          }
          return accountData;
        });
      });
    },

    signUp: function (originalEmail, password, options) {
      options = options || {};
      var email = trim(originalEmail);
      var self = this;
      // ensure resend works again
      this._signUpResendCount = 0;

      // We need to check for the relink warning here *before*
      // we do the account creation. Otherwise, the user may
      // cancel later in the relink warning during sign in,
      // but still have an account created for her.
      return this._checkForDesktopSyncRelinkWarning(email)
              .then(_.bind(this._getClientAsync, this))
              .then(function (client) {
                var signUpOptions = {
                  keys: true
                };

                if (self._relierHas('service')) {
                  signUpOptions.service = self._relierGet('service');
                }

                if (self._relierHas('redirectTo')) {
                  signUpOptions.redirectTo = self._relierGet('redirectTo');
                }

                if (options.preVerified) {
                  signUpOptions.preVerified = true;
                }

                if (options.preVerifyToken) {
                  signUpOptions.preVerifyToken = options.preVerifyToken;
                }

                return client.signUp(email, password, signUpOptions);
              })
              .then(function () {
                var signInOptions = {
                  customizeSync: options.customizeSync,
                  verifiedCanLinkAccount: true // skip the warning, beacuse we already triggered it above
                };
                return self.signIn(email, password, signInOptions);
              });
    },

    signUpResend: function () {
      var self = this;
      return this._getClientAsync()
        .then(function (client) {
          if (self._signUpResendCount >= Constants.SIGNUP_RESEND_MAX_TRIES) {
            var defer = p.defer();
            defer.resolve(true);
            return defer.promise;
          } else {
            self._signUpResendCount++;
          }

          var clientOptions = {
            service: self._relierGet('service'),
            redirectTo: self._relierGet('redirectTo')
          };

          return client.recoveryEmailResendCode(
                    Session.sessionToken, clientOptions);
        });
    },

    signOut: function () {
      return this._getClientAsync()
              .then(function (client) {
                return client.sessionDestroy(Session.sessionToken);
              })
              .then(function () {
                // user's session is gone
                Session.clear();
              }, function () {
                // Clear the session, even on failure. Everything is A-OK.
                // See issue #616
                // - https://github.com/mozilla/fxa-content-server/issues/616
                Session.clear();
              });
    },

    verifyCode: function (uid, code) {
      return this._getClientAsync()
              .then(function (client) {
                return client.verifyCode(uid, code);
              });
    },

    passwordReset: function (originalEmail) {
      var self = this;
      var email = trim(originalEmail);
      var forceAuth = Session.forceAuth;
      var oauth = Session.oauth;

      // ensure resend works again
      this._passwordResetResendCount = 0;

      return this._getClientAsync()
              .then(function (client) {
                var clientOptions = {
                  service: self._relierGet('service'),
                  redirectTo: self._relierGet('redirectTo')
                };

                return client.passwordForgotSendCode(email, clientOptions);
              })
              .then(function (result) {
                Session.clear();

                // The user may resend the password reset email, in which case
                // we have to keep around some state so the email can be
                // resent.
                Session.set('email', email);
                Session.set('forceAuth', forceAuth);
                Session.set('passwordForgotToken', result.passwordForgotToken);
                Session.set('oauth', oauth);
              });
    },

    passwordResetResend: function () {
      var self = this;
      return this._getClientAsync()
        .then(function (client) {
          if (self._passwordResetResendCount >= Constants.PASSWORD_RESET_RESEND_MAX_TRIES) {
            var defer = p.defer();
            defer.resolve(true);
            return defer.promise;
          } else {
            self._passwordResetResendCount++;
          }
          // the linters complain if this is defined in the call to
          // passwordForgotResendCode
          var clientOptions = {
            service: self._relierGet('service'),
            redirectTo: self._relierGet('redirectTo')
          };

          return client.passwordForgotResendCode(
                   Session.email,
                   Session.passwordForgotToken,
                   clientOptions
                 );
        });
    },

    completePasswordReset: function (originalEmail, newPassword, token, code) {
      var email = trim(originalEmail);
      var client;
      return this._getClientAsync()
              .then(function (_client) {
                client = _client;
                return client.passwordForgotVerifyCode(code, token);
              })
              .then(function (result) {
                return client.accountReset(email,
                           newPassword,
                           result.accountResetToken);
              });
    },

    isPasswordResetComplete: function (token) {
      return this._getClientAsync()
        .then(function (client) {
          return client.passwordForgotStatus(token);
        })
        .then(function () {
          // if the request succeeds, the password reset hasn't completed
          return false;
        }, function (err) {
          if (AuthErrors.is(err, 'INVALID_TOKEN')) {
            return true;
          }
          throw err;
        });
    },

    changePassword: function (originalEmail, oldPassword, newPassword) {
      var email = trim(originalEmail);
      var self = this;
      var sessionTokenContext = Session.sessionTokenContext;
      return this._getClientAsync()
              .then(function (client) {
                return client.passwordChange(email, oldPassword, newPassword);
              })
              .then(function () {
                // Clear old info on password change.
                Session.clear();
                return self.signIn(email, newPassword);
              }).then(function (result) {
                // Restore the sessionTokenContext because it indicates if we're
                // in a Sync flow or not.
                Session.set('sessionTokenContext', sessionTokenContext);
                return result;
              });
    },

    deleteAccount: function (originalEmail, password) {
      var email = trim(originalEmail);
      return this._getClientAsync()
              .then(function (client) {
                return client.accountDestroy(email, password);
              })
              .then(function () {
                Session.clear();
              });
    },

    certificateSign: function (pubkey, duration) {
      return this._getClientAsync()
              .then(function (client) {
                return client.certificateSign(
                  Session.sessionToken,
                  pubkey,
                  duration);
              });
    },

    sessionStatus: function (sessionToken) {
      return this._getClientAsync()
              .then(function (client) {
                return client.sessionStatus(sessionToken);
              });
    },

    isSignedIn: function (sessionToken) {
      // Check if the user is signed in.
      if (! sessionToken) {
        return p(false);
      }

        // Validate session token
      return this.sessionStatus(sessionToken)
        .then(function() {
          return true;
        }, function(err) {
          // the only error that we expect is INVALID_TOKEN,
          // rethrow all others.
          if (AuthErrors.is(err, 'INVALID_TOKEN')) {
            return false;
          }

          throw err;
        });
    },

    recoveryEmailStatus: function (sessionToken) {
      return this._getClientAsync()
        .then(function (client) {
          return client.recoveryEmailStatus(sessionToken);
        });
    },

    _relierHas: function (itemName) {
      return !! (this._relier && this._relier.has(itemName));
    },

    _relierGet: function (itemName) {
      return this._relier && this._relier.get(itemName);
    }
  };

  return FxaClientWrapper;
});

