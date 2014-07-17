/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';


define([
  'chai',
  'lib/channels/iframe',
  '../../../mocks/window',
  '../../../lib/helpers'
],
function (chai, IFrameChannel, WindowMock, TestHelpers) {
  var channel, windowMock;

  var assert = chai.assert;

  describe('lib/channel/iframe', function () {
    beforeEach(function() {
      windowMock = new WindowMock();
      windowMock.parent = new WindowMock();

      channel = new IFrameChannel();
      channel.init({
        window: windowMock
      });
    });

    describe('send', function () {
      it('sends a message to the parent', function(done) {
        windowMock.parent.postMessage = function(msg, targetOrigin) {
          TestHelpers.wrapAssertion(function () {
            var components = msg.split('!!!');
            var command = components[0];
            var data = JSON.parse(components[1]);

            assert.equal(command, 'command');
            assert.equal(data.key, 'value');
          }, done);
        };

        channel.send('command', { key: 'value' });
      });

      it('can send a message with no data', function(done) {
        windowMock.parent.postMessage = function(msg, targetOrigin) {
          TestHelpers.wrapAssertion(function () {
            var components = msg.split('!!!');
            var command = components[0];
            var data = JSON.parse(components[1]);

            assert.equal(command, 'command');
            assert.equal(Object.keys(data).length, 0);
          }, done);
        };

        channel.send('command');
      });
    });
  });
});


