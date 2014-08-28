/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A broker that knows how to communicate with Firefox when used for Sync.
 */

'use strict';

define([
  'underscore',
  'models/brokers/broker',
  'lib/channels',
  'lib/session',
  'lib/promise',
  'lib/channels/fx-desktop',
  'lib/auth-errors'
], function (_, Broker, Channels, Session, p, FxDesktopChannel, AuthErrors) {

  var FxDesktopBroker = Broker.extend({
    initialize: function (options) {
      options = options || {};

      this._window = options.window || window;

      this._channel = options.channel || new FxDesktopChannel();
      this._channel.init({
        window: this._window
      });

      return Broker.prototype.initialize.call(this, options);
    },

    fetch: function () {
      var self = this;
      return p().then(function () {
        var deferred = p.defer();

        self._channel.send('session_status', {}, function (err, response) {
          if (err) {
            return deferred.reject(err);
          }

          if (! (response && response.data)) {
            return deferred.reject(AuthErrors.toError('NO_BROWSER_RESPONSE'));
          }

          self._sessionStatus = response.data;

          deferred.resolve(self._sessionStatus);
        });

        return deferred.promise;
      })
      .then(_.bind(this.initializeSession, this));
    },

    _isForceAuth: function () {
      // XXX is this the correct place for this?
      return this._window.location.pathname === '/force_auth';
    },

    initializeSession: function () {
      var self = this;
      return p().then(function () {
        var sessionStatus = self._sessionStatus;
        if (self._isForceAuth()) {
          Session.clear();
          // XXX does this go here, or into the Relier?
          // forceAuth is only used for the FxDesktop Sync flow.
          Session.set('forceAuth', true);
        } else if (! sessionStatus) {
          Session.clear();
        } else {
          Session.set('email', sessionStatus.email);
        }
      });
    },

    selectStartPage: function () {
      var self = this;
      return p().then(function () {
        var canRedirect = self._window.location.pathname === '/';
        if (canRedirect) {
          if (self._isForceAuth()) {
            return 'force_auth';
          } else if (self._sessionStatus.email) {
            return 'settings';
          } else {
            return 'signup';
          }
        }
      });
    }
  });

  return FxDesktopBroker;
});

