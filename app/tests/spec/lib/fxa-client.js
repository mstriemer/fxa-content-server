/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

define([
  'chai',
  'jquery',
  'sinon',
  'lib/promise',
  '../../mocks/channel',
  '../../lib/helpers',
  'lib/session',
  'lib/fxa-client',
  'lib/auth-errors',
  'lib/constants',
  'models/reliers/relier'
],
// FxaClientWrapper is the object that is used in
// fxa-content-server views. It wraps FxaClient to
// take care of some app-specific housekeeping.
function (chai, $, sinon, p, ChannelMock, testHelpers, Session,
    FxaClientWrapper, AuthErrors, Constants, Relier) {
  'use strict';

  var assert = chai.assert;
  var email;
  var password = 'password';
  var client;
  var realClient;
  var channelMock;
  var relier;

  function trim(str) {
    return str && str.replace(/^\s+|\s+$/g, '');
  }

  describe('lib/fxa-client', function () {
    beforeEach(function () {
      channelMock = new ChannelMock();
      email = ' ' + testHelpers.createEmail() + ' ';
      relier = new Relier();

      client = new FxaClientWrapper({
        channel: channelMock,
        relier: relier
      });
      return client._getClientAsync()
              .then(function (_realClient) {
                realClient = _realClient;
                // create spies that can be used to check
                // parameters that are passed to the FxaClient
                testHelpers.addFxaClientSpy(realClient);
              });
    });

    afterEach(function () {
      channelMock = null;

      // return the client to its original state.
      testHelpers.removeFxaClientSpy(realClient);
    });

    describe('signUp/signUpResend', function () {
      it('signUp signs up a user with email/password', function () {
        relier.set('service', 'sync');
        relier.set('redirectTo', 'https://sync.firefox.com');

        return client.signUp(email, password)
          .then(function () {
            assert.equal(channelMock.message, 'login');
            assert.isUndefined(channelMock.data.customizeSync);

            assert.isTrue(realClient.signUp.calledWith(trim(email), password, {
              keys: true,
              service: 'sync',
              redirectTo: 'https://sync.firefox.com'
            }));
          });
      });

      it('a throttled signUp returns a THROTTLED error', function () {
        var FxaClientMock = {
          signUp: function () {
            return p.reject({
              code: 429,
              errno: 114,
              error: 'Too Many Requests',
              message: 'Client has sent too many requests'
            });
          }
        };

        return new FxaClientWrapper({
          client: FxaClientMock,
          channel: channelMock,
          relier: relier
        }).signUp(email, password)
          .then(
            assert.fail,
            function (err) {
              assert.isTrue(AuthErrors.is(err, 'THROTTLED'));
            }
          );
      });

      it('informs browser of customizeSync option', function () {
        relier.isFxDesktop = function () {
          return true;
        };

        return client.signUp(email, password, { customizeSync: true })
          .then(function () {
            assert.isTrue(channelMock.data.customizeSync);
          });
      });

      it('signUpResend resends the validation email', function () {
        relier.set('service', 'sync');
        relier.set('redirectTo', 'https://sync.firefox.com');

        return client.signUp(email, password)
          .then(function () {
            return client.signUpResend();
          })
          .then(function () {
            var params = {
              service: 'sync',
              redirectTo: 'https://sync.firefox.com'
            };
            assert.isTrue(
                realClient.recoveryEmailResendCode.calledWith(
                    Session.sessionToken,
                    params
                ));
          });
      });

      it('signUpResend still shows success after max tries', function () {
        var triesLeft = Constants.SIGNUP_RESEND_MAX_TRIES;

        return client.signUp(email, password)
          .then(function () {
            // exhaust all tries
            for (var i = 0; i < triesLeft; i++) {
              client.signUpResend();
            }
            return client.signUpResend();
          })
          .then(function (result) {
            assert.ok(result);
          });
      });

      it('signUp existing verified user returns ACCOUNT_ALREADY_EXISTS error', function () {
        return client.signUp(email, password, { preVerified: true })
          .then(function () {
            return client.signUp(email, password);
          })
          .then(function () {
            assert(false, 'unexpected success');
          }, function (err) {
            assert.isTrue(AuthErrors.is(err, 'ACCOUNT_ALREADY_EXISTS'));
          });
      });

      it('signUp existing unverified user with different password signs ' +
      'user up again', function () {
        return client.signUp(email, password)
          .then(function () {
            return client.signUp(email, 'different_password');
          })
          .then(function () {
            assert.isTrue(realClient.signUp.called);
            assert.isTrue(realClient.signIn.called);
          });
      });

      it('signUp a preverified user using preVerifyToken', function () {
        var password = 'password';
        var preVerifyToken = 'somebiglongtoken';

        // we are going to take over from here.
        testHelpers.removeFxaClientSpy(realClient);
        sinon.stub(realClient, 'signUp', function () {
          return true;
        });
        sinon.stub(realClient, 'signIn', function () {
          return {
            sessionToken: 'asessiontoken'
          };
        });

        return client.signUp(email, password, {
          preVerifyToken: preVerifyToken
        })
        .then(function () {
          assert.isTrue(realClient.signUp.calledWith(trim(email), password, {
            preVerifyToken: preVerifyToken,
            keys: true
          }));
          assert.isTrue(realClient.signIn.called);
        });
      });
    });

    describe('signUp when another user has previously signed in to browser and user accepts', function () {
      it('sends verifiedCanLinkAccount along with the login message', function () {
        return client.signUp(email, password)
          .then(function() {
            // check that login was the last message sent over the channel
            assert.equal(channelMock.message, 'login');
            // check can_link_account was called once
            assert.equal(channelMock.getMessageCount('can_link_account'), 1);
            // and it includes that it has already verified that it is allowed to link
            assert.isTrue(channelMock.data.verifiedCanLinkAccount);
            assert.isTrue(realClient.signIn.calledWith(trim(email)));
          });
      });
    });

    describe('signUp when another user has previously signed in to browser and user rejects', function () {
      it('throws a USER_CANCELED_LOGIN error', function () {
        // simulate the user rejecting
        channelMock.canLinkAccountOk = false;
        return client.signUp(email, password)
          .then(function() {
            assert(false, 'should throw USER_CANCELED_LOGIN');
          }, function (err) {
            assert.isTrue(AuthErrors.is(err, 'USER_CANCELED_LOGIN'));
            // check can_link_account was called once
            assert.equal(channelMock.getMessageCount('can_link_account'), 1);
          });
      });
    });

    describe('signIn', function () {
      it('signin with unknown user should call errorback', function () {
        return client.signIn('unknown@unknown.com', 'password')
              .then(function (info) {
                assert(false, 'unknown user cannot sign in');
              }, function (err) {
                assert.isTrue(true);
              });
      });

      it('signs a user in with email/password', function () {
        return client.signUp(email, password)
          .then(function () {
            return client.signIn(email, password);
          })
          .then(function () {
            assert.isTrue(realClient.signIn.calledWith(trim(email)));
            assert.equal(channelMock.message, 'login');
            assert.isUndefined(channelMock.data.customizeSync);
          });
      });

      it('informs browser of customizeSync option', function () {
        relier.isFxDesktop = function () {
          return true;
        };

        return client.signUp(email, password)
          .then(function () {
            return client.signIn(email, password, { customizeSync: true });
          })
          .then(function () {
            assert.equal(channelMock.message, 'login');
            assert.isTrue(channelMock.data.customizeSync);
          });
      });
    });

    describe('signIn with verifiedCanLinkAccount=true option', function () {
      it('sends verifiedCanLinkAccount along with the login message', function () {
        return realClient.signUp(trim(email), password)
          .then(function() {
            return client.signIn(email, password, { verifiedCanLinkAccount: true });
          })
          .then(function() {
            // check that login was the last message sent over the channel
            assert.equal(channelMock.message, 'login');
            // check can_link_account was called zero times
            assert.equal(channelMock.getMessageCount('can_link_account'), 0);
            // and it includes that it has already verified that it is allowed to link
            assert.isTrue(channelMock.data.verifiedCanLinkAccount);
            assert.isTrue(realClient.signIn.calledWith(trim(email)));
          });
      });
    });


    describe('signIn when another user has previously signed in to browser and user accepts', function () {
      it('sends verifiedCanLinkAccount along with the login message', function () {
        return realClient.signUp(trim(email), password)
          .then(function() {
            return client.signIn(email, password);
          })
          .then(function() {
            // check that login was the last message sent over the channel
            assert.equal(channelMock.message, 'login');
            // check can_link_account was called once
            assert.equal(channelMock.getMessageCount('can_link_account'), 1);
            // and it includes that it has already verified that it is allowed to link
            assert.isTrue(channelMock.data.verifiedCanLinkAccount);
            assert.isTrue(realClient.signIn.calledWith(trim(email)));
          });
      });
    });

    describe('signIn when another user has previously signed in to browser and user rejects', function () {
      it('throws a USER_CANCELED_LOGIN error', function () {
        // simulate the user rejecting
        channelMock.canLinkAccountOk = false;
        return client.signIn(email, password)
          .then(function() {
            assert(false, 'should throw USER_CANCELED_LOGIN');
          }, function (err) {
            assert.isTrue(AuthErrors.is(err, 'USER_CANCELED_LOGIN'));
            // check can_link_account was called once
            assert.equal(channelMock.getMessageCount('can_link_account'), 1);
          });
      });
    });

    describe('passwordReset/passwordResetResend', function () {
      it('requests a password reset', function () {
        return client.signUp(email, password)
          .then(function () {
            relier.set('service', 'sync');
            relier.set('redirectTo', 'https://sync.firefox.com');
            return client.passwordReset(email);
          })
          .then(function () {
            var params = {
              service: 'sync',
              redirectTo: 'https://sync.firefox.com'
            };
            assert.isTrue(
                realClient.passwordForgotSendCode.calledWith(
                    trim(email),
                    params
                ));
            return client.passwordResetResend();
          })
          .then(function () {
            var params = {
              service: 'sync',
              redirectTo: 'https://sync.firefox.com'
            };
            assert.isTrue(
                realClient.passwordForgotResendCode.calledWith(
                    trim(email),
                    Session.passwordForgotToken,
                    params
                ));
          });
      });

      it('passwordResetResend still shows success after max tries', function () {
        var triesLeft = Constants.PASSWORD_RESET_RESEND_MAX_TRIES;

        return client.signUp(email, password)
          .then(function () {
            return client.passwordReset(email);
          })
          .then(function () {
            // exhaust all tries
            for (var i = 0; i < triesLeft; i++) {
              client.passwordResetResend();
            }
            return client.passwordResetResend();
          })
          .then(function (result) {
            assert.ok(result);
          });
      });
    });

    describe('completePasswordReset', function () {
    });

    describe('signOut', function () {
      it('signs the user out', function () {
        return client.signUp(email, password)
          .then(function () {
            return client.signOut();
          });
      });

      it('resolves to success on XHR failure', function () {
        return client.signUp(email, password)
          .then(function () {
            return client.signOut();
          })
          .then(function () {
            // user has no session, this will cause an XHR error.
            return client.signOut();
          });
      });
    });

    describe('checkPassword', function () {
      it('returns error if password is incorrect', function () {
        email = trim(email);
        return realClient.signUp(email, password, { preverified: true })
          .then(function() {
            return client.checkPassword(email, 'badpassword');
          })
          .then(function () {
            assert.fail('unexpected success');
          }, function(err) {
            assert.isTrue(AuthErrors.is(err, 'INCORRECT_PASSWORD'));
          });
      });

      it('succeeds if password is correct', function () {
        email = trim(email);
        return realClient.signUp(email, password, { preverified: true })
          .then(function() {
            return client.checkPassword(email, password);
          });
      });
    });

    describe('changePassword', function () {
      it('changes the user\'s password', function () {
        return client.signUp(email, password, {preVerified: true})
          .then(function () {
            return client.changePassword(email, password, 'new_password');
          })
          .then(function () {
            assert.isTrue(realClient.passwordChange.calledWith(trim(email)));
            // user is automatically re-authenticated with their new password
            assert.equal(channelMock.message, 'login');
          });
      });
    });

    describe('isPasswordResetComplete', function () {
      it('password status incomplete', function () {
        var token;
        return client.signUp(email, password, {preVerified: true})
          .then(function () {
            return client.passwordReset(email);
          })
          .then(function () {
            assert.ok(Session.passwordForgotToken);
            token = Session.passwordForgotToken;
            return client.isPasswordResetComplete(token);
          })
          .then(function (complete) {
            // cache the token so it's not cleared after the password change
            assert.isFalse(complete);

            // change password to force password reset to return true
            return client.changePassword(email, password, 'new_password');
          })
          .then(function () {
            return client.isPasswordResetComplete(token);
          })
          .then(function (complete) {
            assert.isTrue(complete);
          });
      });
    });

    describe('deleteAccount', function () {
      it('deletes the user\'s account', function () {
        return client.signUp(email, password)
          .then(function () {
            return client.deleteAccount(email, password);
          })
          .then(null, function (err) {
            assert.isTrue(realClient.accountDestroy.calledWith(trim(email)));
            // this test is necessary because errors in deleteAccount
            // should not be propagated to the final done's error
            // handler
            throw new Error('unexpected failure: ' + err.message);
          })
          .then(function () {
            return client.signIn(email, password);
          })
          .then(function () {
            throw new Error('should not be able to signin after account deletion');
          }, function () {
            // positive test to ensure sign in failure case has an assertion
            assert.isTrue(true);
          });
      });
    });

    describe('sessionStatus', function () {
      it('checks sessionStatus', function () {
        return client.signUp(email, password)
          .then(function () {
            return client.sessionStatus(Session.sessionToken);
          })
          .then(function () {
            assert.isTrue(realClient.sessionStatus.calledWith(Session.sessionToken));
          });
      });
    });

    describe('certificateSign', function () {
      it('signs certificate', function () {
        var publicKey = {
          algorithm: 'RS',
          n: '4759385967235610503571494339196749614544606692567785790953934768202714280652973091341' +
             '316862993582789079872007974809511698859885077002492642203267408776123',
          e: '65537'
        };
        var duration = 86400000;

        return client.signUp(email, password, { preVerified: true })
          .then(function (kp) {
            return client.certificateSign(publicKey, duration);
          })
          .then(function (cert) {
            console.log(cert);
            assert.ok(cert);
          });
      });
    });

    describe('isSignedIn', function () {
      it('resolves to false if no sessionToken passed in', function () {
        return client.isSignedIn()
            .then(function (isSignedIn) {
              assert.isFalse(isSignedIn);
            });
      });

      it('resolves to false if invalid sessionToken passed in', function () {
        return client.isSignedIn('not a real token')
            .then(function (isSignedIn) {
              assert.isFalse(isSignedIn);
            });
      });

      it('resolves to true with a valid sessionToken', function () {
        return client.signUp(email, password)
          .then(function () {
            return client.isSignedIn(Session.sessionToken);
          })
          .then(function (isSignedIn) {
            assert.isTrue(isSignedIn);
          });
      });
    });

    describe('getRandomBytes', function () {
      it('snags some entropy from somewhere', function () {
        return client.getRandomBytes()
            .then(function (bytes) {
              assert.ok(bytes);
            });
      });
    });

  });
});

