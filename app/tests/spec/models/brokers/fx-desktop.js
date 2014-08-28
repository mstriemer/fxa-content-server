/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

define([
  'chai',
  'underscore',
  'models/brokers/fx-desktop',
  'lib/constants',
  '../../../mocks/window'
], function (chai, _, FxDesktopBroker, Constants, WindowMock) {
  var assert = chai.assert;

  describe('models/brokers/fx-desktop', function () {
    var windowMock;
    var broker;

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
      broker = new FxDesktopBroker({
        window: windowMock
      });
    });

    describe('selectStartPage', function () {
      it('returns /settings if is signed in', function () {
        windowMock.on('session_status', function () {
          dispatchEventFromWindowMock('session_status', {
            email: 'testuser@testuser.com'
          });
        });

        return broker.fetch()
            .then(_.bind(broker.selectStartPage, broker))
            .then(function (page) {
              assert.equal(page, 'settings');
            });
      });

      it('returns /signup if no email is set, and no pathname is specified', function () {
        windowMock.on('session_status', function () {
          // no data from session_status signifies no user is signed in.
          dispatchEventFromWindowMock('session_status', {});
        });

        return broker.fetch()
            .then(_.bind(broker.selectStartPage, broker))
            .then(function (page) {
              assert.equal(page, 'signup');
            });
      });

      it('returns nothing if a route is present in the path', function () {
        windowMock.location.pathname = '/signin';

        windowMock.on('session_status', function () {
          // no data from session_status signifies no user is signed in.
          dispatchEventFromWindowMock('session_status', {});
        });

        return broker.fetch()
            .then(_.bind(broker.selectStartPage, broker))
            .then(function (page) {
              assert.isUndefined(page);
            });
      });
    });
  });
});
