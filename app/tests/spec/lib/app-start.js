/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';


define([
  'chai',
  'sinon',
  'lib/app-start',
  'lib/session',
  'lib/constants',
  '../../mocks/window',
  '../../mocks/router',
  '../../mocks/history'
],
function (chai, sinon, AppStart, Session, Constants, WindowMock, RouterMock, HistoryMock) {
  /*global describe, beforeEach, it*/
  var assert = chai.assert;

  describe('lib/app-start', function () {
    var windowMock;
    var routerMock;
    var historyMock;
    var appStart;


    function getFxDesktopContextSearchString() {
      return '?context=' + Constants.FX_DESKTOP_CONTEXT;
    }

    function dispatchEventFromWindowMock(status, data) {
      windowMock.dispatchEvent({
        detail: {
          command: 'message',
          data: {
            status: status,
            data: data
          }
        }
      });
    }

    beforeEach(function () {
      windowMock = new WindowMock();
      routerMock = new RouterMock();
      historyMock = new HistoryMock();

      appStart = new AppStart({
        window: windowMock,
        router: routerMock,
        history: historyMock
      });
    });

    describe('startApp', function () {
      it('starts the app', function () {
        return appStart.startApp()
                    .then(function () {
                      assert.ok(Session.config);

                      // translator is put on the global object.
                      assert.ok(windowMock.translator);
                    });
      });

      it('redirects to /cookies_disabled if localStorage is disabled', function () {
        appStart.useConfig({
          localStorageEnabled: false,
          i18n: {
            supportedLanguages: ['en'],
            defaultLang: 'en'
          }
        });

        return appStart.startApp()
            .then(function () {
              assert.equal(routerMock.page, 'cookies_disabled');
            });
      });

      it('redirects to /settings if the context is FXA_DESKTOP and user is signed in', function () {
        windowMock.location.search = getFxDesktopContextSearchString();

        windowMock.on('session_status', function () {
          dispatchEventFromWindowMock('session_status', {
            email: 'testuser@testuser.com'
          });
        });

        return appStart.startApp()
            .then(function () {
              assert.equal(routerMock.page, 'settings');
            });
      });

      it('redirects to /signup if the context is FXA_DESKTOP, no email is set, and no pathname is specified', function () {
        windowMock.location.search = getFxDesktopContextSearchString();

        windowMock.on('session_status', function () {
          // no data from session_status signifies no user is signed in.
          dispatchEventFromWindowMock('session_status');
        });

        return appStart.startApp()
            .then(function () {
              assert.equal(routerMock.page, 'signup');
            });
      });

      it('does not redirect the user if a route is present in the path', function () {
        windowMock.location.search = getFxDesktopContextSearchString();
        windowMock.location.pathname = '/signin';
        routerMock.page = 'signin';

        windowMock.on('session_status', function () {
          // no data from session_status signifies no user is signed in.
          dispatchEventFromWindowMock('session_status');
        });

        return appStart.startApp()
            .then(function () {
              assert.equal(routerMock.page, 'signin');
            });
      });

      it('sets the session service from a client_id query parameter', function () {
        windowMock.location.search = '?client_id=testing';
        return appStart.startApp()
                    .then(function () {
                      assert.equal(Session.service, 'testing');
                    });
      });

      it('redirects to /unexpecte_error if an error occurs and it has a router', function () {
        sinon.stub(appStart, 'allResourcesReady', function () {
          throw new Error('boom');
        });

        return appStart.startApp()
            .then(function () {
              assert.equal(routerMock.page, 'unexpected_error');
            });
      });

      it('redirects to /503.html if an error occurs and it has no router', function () {
        appStart = new AppStart({
          window: windowMock,
          history: historyMock
        });
        sinon.stub(appStart, 'initializeConfig', function () {
          throw new Error('boom');
        });

        return appStart.startApp()
            .then(function () {
              assert.equal(windowMock.location.href, Constants.INTERNAL_ERROR_PAGE);
            });
      });
    });
  });
});


