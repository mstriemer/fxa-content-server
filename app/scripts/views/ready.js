/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Handle sign_up_complete and reset_password_complete.
 * Prints a message to the user that says
 * "All ready! You can go visit {{ service }}"
 */

'use strict';

define([
  'underscore',
  'views/base',
  'views/form',
  'stache!templates/ready',
  'lib/session',
  'lib/xss',
  'lib/url',
  'lib/strings',
  'views/mixins/service-mixin',
  'views/marketing_snippet'
],
function (_, BaseView, FormView, Template, Session, Xss, Url, Strings,
              ServiceMixin, MarketingSnippet) {

  var View = BaseView.extend({
    template: Template,
    className: 'ready',

    initialize: function (options) {
      options = options || {};

      this.type = options.type;
      this.language = options.language;
    },

    beforeRender: function () {
      if (this.isOAuthSameBrowser()) {
        // We're continuing an OAuth flow from the same browser
        this.setupOAuth(Session.oauth);
        return this.setServiceInfo();
      } else if (this.hasService()) {
        // We're continuing an OAuth flow in a different browser
        this.setupOAuth();
        return this.setServiceInfo();
      }
    },

    context: function () {
      return {
        service: this.service,
        serviceName: this._getServiceName(),
        signUp: this.is('sign_up'),
        resetPassword: this.is('reset_password')
      };
    },

    events: {
      'click #redirectTo': BaseView.preventDefaultThen('submit')
    },

    submit: function () {
      this._finishOAuthFlow();
    },

    afterRender: function() {
      var graphic = this.$el.find('.graphic');
      graphic.addClass('pulse');

      if (this.shouldAutoFinishOAuthFlow()) {
        return this._finishOAuthFlow();
      } else {
        return this._createMarketingSnippet();
      }
    },

    _getServiceName: function () {
      var serviceName = this.serviceName;

      if (this.serviceRedirectURI && ! this.shouldAutoFinishOAuthFlow()) {
        serviceName = Strings.interpolate('<a href="%s" class="no-underline" id="redirectTo">%s</a>', [
          Xss.href(this.serviceRedirectURI), serviceName
        ]);
      }

      return serviceName;
    },

    _createMarketingSnippet: function () {
      var marketingSnippet = new MarketingSnippet({
        type: this.type,
        service: Session.service,
        language: this.language,
        el: this.$('.marketing-area'),
        metrics: this.metrics
      });
      this.trackSubview(marketingSnippet);

      return marketingSnippet.render();
    },

    _finishOAuthFlow: function () {
      if (this.isOAuthSameBrowser()) {
        return this.finishOAuthFlow({
          source: this.type
        });
      } else if (this.hasService()) {
        return this.finishOAuthFlowDifferentBrowser();
      }
      // what happens if neither of those match?
    },

    is: function (type) {
      return this.type === type;
    }
  });

  _.extend(View.prototype, ServiceMixin);

  return View;
});
