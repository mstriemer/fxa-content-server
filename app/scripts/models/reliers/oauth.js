/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * An OAuth Relier - holds OAuth information.
 */

'use strict';

define([
  'underscore',
  'models/reliers/relier',
  'lib/resume-token'
], function (_, Relier, ResumeToken) {

  var OAuthRelier = Relier.extend({
    defaults: _.extend({}, Relier.prototype.defaults, {
      // standard oauth parameters.
      state: null,
      clientId: null,
      // redirectUri is used by the oauth flow
      redirectUri: null,
      scope: null,
      // redirectTo is for future use by the oauth flow. redirectTo
      // would have redirectUri as its base.
      redirectTo: null,

      // webChannelId is used by the Loop OAuth flow.
      webChannelId: null
    }),

    initialize: function (options) {
      options = options || {};

      Relier.prototype.initialize.call(this, options);

      this._session = options.session;
      this._oAuthClient = options.oAuthClient;
    },

    fetch: function () {
      var self = this;
      return Relier.prototype.fetch.call(this)
          .then(function () {
            if (self._isVerificationFlow()) {
              self._setupVerificationFlow();
            } else {
              self._setupSigninSignupFlow();
            }

            if (! self.has('service')) {
              self.set('service', self.get('clientId'));
            }

            return self._setupOAuthRPInfo();
          });
    },

    isOAuth: function () {
      return true;
    },

    canResume: function () {
      return this.has('state') &&
             this.has('clientId') &&
             this.has('scope') &&
             this.has('email');

    },

    _isVerificationFlow: function () {
      return !! this.getSearchParam('resume');
    },

    _setupVerificationFlow: function () {
      var self = this;

      var resumeObj = ResumeToken.parse(this.getSearchParam('resume'));

      // If there was no resume token, try to get the oauth parameters
      // from Session. This allows for users verify in the same browser
      // but their resume token was missing (email sent before server update)
      // or bad to continue as expected.
      if (! resumeObj) {
        resumeObj = self._session.oauth;
      }

      if (! resumeObj) {
        return;
      }

      // all params except redirectUri come from the resume token.
      // redirectURI will be fetched from the oauth-server.
      // `email` is imported post-verification to allow the user
      // to sign-in if needed.
      self.set({
        state: resumeObj.state,
        clientId: resumeObj.clientId,
        redirectUri: resumeObj.redirectUri,
        scope: resumeObj.scope,
        email: resumeObj.email,
        webChannelId: resumeObj.webChannelId
      });
    },

    _setupSigninSignupFlow: function () {
      var self = this;

      // params listed in:
      // https://github.com/mozilla/fxa-oauth-server/blob/master/docs/api.md#post-v1authorization
      self.importSearchParam('state');
      self.importSearchParam('client_id', 'clientId');
      self.importSearchParam('redirect_uri', 'redirectUri');
      self.importSearchParam('scope');

      self.importSearchParam('redirectTo');
      self.importSearchParam('webChannelId');
    },

    _setupOAuthRPInfo: function () {
      var self = this;
      var clientId = self.get('clientId');

      if (clientId) {
        return this._oAuthClient.getClientInfo(clientId)
          .then(function(serviceInfo) {
            self.set('serviceName', serviceInfo.name);
            //jshint camelcase: false
            // server version always takes precedent over the search parameter
            self.set('redirectUri', serviceInfo.redirect_uri);
          });
      }
    }
  });

  return OAuthRelier;
});


