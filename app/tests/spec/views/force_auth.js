/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';


define([
  'chai',
  'jquery',
  'views/force_auth',
  'lib/session',
  'lib/fxa-client',
  'models/reliers/relier',
  '../../mocks/window',
  '../../mocks/router',
  '../../lib/helpers'
],
function (chai, $, View, Session, FxaClient, Relier, WindowMock,
      RouterMock, TestHelpers) {
  var assert = chai.assert;

  describe('/views/force_auth', function () {
    describe('missing email address', function () {
      var view;
      var windowMock;
      var fxaClient;
      var relier;

      beforeEach(function () {
        windowMock = new WindowMock();
        windowMock.location.search = '';

        relier = new Relier();
        fxaClient = new FxaClient({
          relier: relier
        });

        Session.clear();
        view = new View({
          window: windowMock,
          fxaClient: fxaClient,
          relier: relier
        });
        return view.render()
            .then(function () {
              $('#container').html(view.el);
            });
      });

      afterEach(function () {
        view.remove();
        view.destroy();
        windowMock = view = null;
      });

      it('prints an error message', function () {
        windowMock.location.search = '';

        assert.notEqual(view.$('.error').text(), '');
      });

      it('shows no avatar if Session.avatar is undefined', function (done) {
        Session.set('forceEmail', 'a@a.com');
        assert.isNull(view.context().avatar);

        return view.render()
          .then(function () {
            assert.notOk(view.$('.avatar-view img').length);
            done();
          })
          .fail(done);
      });

      it('shows no avatar when there is no Session.email', function (done) {
        Session.set('forceEmail', 'a@a.com');
        Session.set('avatar', 'avatar.jpg');
        assert.isNull(view.context().avatar);

        return view.render()
          .then(function () {
            assert.notOk(view.$('.avatar-view img').length);
            done();
          })
          .fail(done);
      });

      it('shows avatar when Session.email and Session.forceEmail match', function (done) {
        Session.set('forceEmail', 'a@a.com');
        Session.set('email', 'a@a.com');
        Session.set('avatar', 'avatar.jpg');
        assert.equal(view.context().avatar, 'avatar.jpg');

        return view.render()
          .then(function () {
            assert.ok(view.$('.avatar-view img').length);
            done();
          })
          .fail(done);
      });

      it('shows no avatar when Session.email and Session.forceEmail do not match', function (done) {
        Session.set('forceEmail', 'a@a.com');
        Session.set('email', 'b@b.com');
        Session.set('avatar', 'avatar.jpg');
        assert.isNull(view.context().avatar);

        return view.render()
          .then(function () {
            assert.notOk(view.$('.avatar-view img').length);
            done();
          })
          .fail(done);
      });
    });

    describe('with email', function () {
      var view;
      var windowMock;
      var router;
      var email;
      var fxaClient;
      var relier;

      beforeEach(function () {
        email = TestHelpers.createEmail();
        Session.set('prefillPassword', 'password');

        windowMock = new WindowMock();
        windowMock.location.search = '?email=' + encodeURIComponent(email);
        relier = new Relier();
        fxaClient = new FxaClient({
          relier: relier
        });
        router = new RouterMock();

        view = new View({
          window: windowMock,
          router: router,
          fxaClient: fxaClient,
          relier: relier
        });
        return view.render()
            .then(function () {
              $('#container').html(view.el);
            });
      });

      afterEach(function () {
        view.remove();
        view.destroy();
        windowMock = router = view = null;
        $('#container').empty();
      });


      it('is able to submit the form', function (done) {
        view._signIn = function() {
          done();
        };
        $('#submit-btn').click();
      });

      it('does not print an error message', function () {
        assert.equal(view.$('.error').text(), '');
      });

      it('does not allow the email to be edited', function () {
        assert.equal($('input[type=email]').length, 0);
      });

      it('prefills password', function () {
        assert.equal($('input[type=password]').val(), 'password');
      });

      it('user cannot create an account', function () {
        assert.equal($('a[href="/signup"]').length, 0);
      });

      it('isValid is successful when the password is filled out', function () {
        $('.password').val('password');
        assert.isTrue(view.isValid());
      });

      it('forgot password request redirects directly to confirm_reset_password', function () {
        var password = 'password';
        var event = $.Event('click');
        return view.fxaClient.signUp(email, password)
              .then(function () {
                // the call to client.signUp clears Session.
                // These fields are reset to complete the test.
                Session.set('forceAuth', true);
                Session.set('forceEmail', email);

                return view.resetPasswordNow(event);
              })
              .then(function () {
                assert.equal(router.page, 'confirm_reset_password');

                assert.isTrue(event.isDefaultPrevented());
                assert.isTrue(event.isPropagationStopped());
              });
      });

      it('only one forget password request at a time', function () {
        var event = $.Event('click');

        view.resetPasswordNow(event);
        return view.resetPasswordNow(event)
                .then(function () {
                  assert(false, 'unexpected success');
                }, function (err) {
                  assert.equal(err.message, 'submit already in progress');
                });
      });
    });
  });
});


