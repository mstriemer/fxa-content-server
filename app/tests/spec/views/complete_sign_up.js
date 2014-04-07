/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';


define([
  'chai',
  'p-promise',
  'views/complete_sign_up',
  'lib/auth-errors',
  '../../mocks/router',
  '../../mocks/window'
],
function (chai, p, View, authErrors, RouterMock, WindowMock) {
  /*global describe, beforeEach, afterEach, it*/
  var assert = chai.assert;

  describe('views/complete_sign_up', function () {
    var view, routerMock, windowMock, verificationError;

    beforeEach(function () {
      routerMock = new RouterMock();
      windowMock = new WindowMock();

      view = new View({
        router: routerMock,
        window: windowMock
      });

      verificationError = null;
      view.fxaClient.verifyCode = function () {
        view.fxaClient.verifyCode.called = true;
        return p().then(function () {
          if (verificationError) {
            throw verificationError;
          }
        });
      };
      view.fxaClient.verifyCode.called = false;
    });

    afterEach(function () {
      view.remove();
      view.destroy();
      view = windowMock = null;
    });

    describe('render', function () {
      it('shows an error if uid is not available on the URL', function () {
        windowMock.location.search = '?code=code';

        return view.render()
            .then(function () {
              assert.isFalse(view.fxaClient.verifyCode.called);
              assert.ok(view.$('#fxa-verification-link-damaged-header').length);
            });
      });

      it('shows an error if code is not available on the URL', function () {
        windowMock.location.search = '?uid=uid';

        return view.render()
            .then(function () {
              assert.isFalse(view.fxaClient.verifyCode.called);
              assert.ok(view.$('#fxa-verification-link-damaged-header').length);
            });
      });

      it('redirects to /signup_complete if verification successful', function () {
        windowMock.location.search = '?code=code&uid=uid';

        return view.render()
            .then(function () {
              assert.isTrue(view.fxaClient.verifyCode.called);
              assert.equal(routerMock.page, 'signup_complete');
            });
      });

      it('bad code/uid errors display the verification link damaged screen', function () {
        windowMock.location.search = '?code=code&uid=uid';

        verificationError = authErrors.toError('INVALID_PARAMETER', 'code');
        return view.render()
            .then(function () {
              assert.isTrue(view.fxaClient.verifyCode.called);
              assert.ok(view.$('#fxa-verification-link-damaged-header').length);
            });
      });

      it('all other server errors are displayed', function () {
        windowMock.location.search = '?code=code&uid=uid';

        verificationError = new Error('verification error');
        return view.render()
            .then(function () {
              assert.isTrue(view.fxaClient.verifyCode.called);
              assert.ok(view.$('#fxa-verification-error-header').length);
              assert.equal(view.$('.error').text(), 'verification error');
            });
      });
    });
  });
});



