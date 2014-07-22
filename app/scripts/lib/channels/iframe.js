/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';

// A channel that takes care of the IFRAMEd OAuth flow.

define(function () {
  function IFrameChannel() {
  }

  IFrameChannel.prototype = {
    init: function (options) {
      options = options || {};

      this._window = options.window || window;
    },

    teardown: function () {
    },

    send: function (command, data, done) {
      if (this._window && this._window.parent !== this._window) {
        var msg = command + '!!!' + JSON.stringify(data || {});
        this._window.parent.postMessage(msg, '*');
      }

      if (done) {
        done();
      }
    }
  };

  return IFrameChannel;
});

