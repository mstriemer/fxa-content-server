/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// this module starts it all.

/**
 * the flow:
 * 1) Initialize session information from URL search parameters.
 * 2) Fetch /config from the backend, the returned info includes a flag that
 *    indicates whether cookies are enabled.
 * 3) Fetch translations from the backend.
 * 4) Create the web/desktop communication channel.
 * 5) If cookies are disabled, go to the /cookies_disabled page.
 * 6) Start the app if cookies are enabled.
 */

'use strict';

define([
  'underscore',
  'backbone',
  'lib/promise',
  'router',
  'lib/translator',
  'lib/session',
  'lib/url',
  'lib/channels',
  'lib/config-loader',
  'lib/metrics',
  'lib/null-metrics',
  'lib/fxa-client',
  'lib/constants',
  'models/reliers/relier',
  'models/brokers/broker',
  'models/brokers/fx-desktop'
],
function (
  _,
  Backbone,
  p,
  Router,
  Translator,
  Session,
  Url,
  Channels,
  ConfigLoader,
  Metrics,
  NullMetrics,
  FxaClient,
  Constants,
  Relier,
  Broker,
  FxDesktopBroker
) {

  function isMetricsCollectionEnabled (sampleRate) {
    return Math.random() <= sampleRate;
  }

  function createMetrics(sampleRate, options) {
    if (isMetricsCollectionEnabled(sampleRate)) {
      return new Metrics(options);
    }

    return new NullMetrics();
  }

  function Start(options) {
    options = options || {};

    this._window = options.window || window;
    this._router = options.router;
    this._relier = options.relier;
    this._broker = options.broker;

    this._history = options.history || Backbone.history;
    this._configLoader = new ConfigLoader();
  }

  Start.prototype = {
    startApp: function () {
      this.initSessionFromUrl();

      // fetch both config and translations in parallel to speed up load.
      return p.all([
        this.initializeRelier(),
        this.initializeConfig(),
        this.initializeL10n()
      ])
      // broker relies on the relier.
      .then(_.bind(this.initializeBroker, this))
      // fxaClient depends on the relier
      .then(_.bind(this.initializeFxaClient, this))
      // both the metrics and router depend on the language
      // fetched from config.
      .then(_.bind(this.initializeMetrics, this))
      // router depends on all of the above
      .then(_.bind(this.initializeRouter, this))
      .then(_.bind(this.allResourcesReady, this));
    },

    initializeConfig: function () {
      return this._configLoader.fetch()
                    .then(_.bind(this.useConfig, this));
    },

    useConfig: function (config) {
      this._config = config;
      this._configLoader.useConfig(config);
      Session.set('config', config);
    },

    initializeL10n: function () {
      var translator = this._window.translator = new Translator();
      return translator.fetch();
    },

    initializeMetrics: function () {
      this._metrics = createMetrics(this._config.metricsSampleRate, {
        lang: this._config.language
      });
      this._metrics.init();
    },

    initializeRelier: function () {
      if (! this._relier) {
        this._relier = new Relier({
          window: this._window
        });

        return this._relier.fetch();
      }
    },

    _isFxDesktop: function () {
      return this._searchParam('context') === Constants.FX_DESKTOP_CONTEXT;
    },

    initializeFxaClient: function () {
      if (! this._fxaClient) {
        this._fxaClient = new FxaClient({
          relier: this._relier
        });
      }
    },

    initializeBroker: function () {
      if (! this._broker) {
        if (this._isFxDesktop()) {
          this._broker = new FxDesktopBroker({
            window: this._window,
            relier: this._relier
          });
        } else {
          this._broker = new Broker({
            relier: this._relier
          });
        }

        return this._broker.fetch();
      }
    },

    initializeRouter: function () {
      if (! this._router) {
        this._router = new Router({
          metrics: this._metrics,
          language: this._config.language,
          relier: this._relier,
          fxaClient: this._fxaClient
        });
      }
      this._window.router = this._router;
    },

    allResourcesReady: function () {
      // These must be initialized after Backbone.history so that
      // Backbone does not override the page the channel sets.
      var self = this;
      return this._selectStartPage()
          .then(function (startPage) {
            // Get the party started.
            // If a new start page is specified, do not attempt to render
            // the route displayed in the URL because the user is
            // immediately redirected
            self._history.start({ pushState: true, silent: !! startPage });
            if (startPage) {
              self._router.navigate(startPage);
            }
          });
    },

    _selectStartPage: function () {
      var self = this;
      return this._configLoader.areCookiesEnabled()
          .then(function (areCookiesEnabled) {
            if (! areCookiesEnabled) {
              return 'cookies_disabled';
            }

            return self._broker.selectStartPage();
          });
    },

    _searchParam: function (name) {
      return Url.searchParam(name, this._window.location.search);
    },

    setSessionValueFromUrl: function (paramName, sessionName) {
      var value = this._searchParam(paramName);
      var name = sessionName || paramName;
      if (value) {
        Session.set(name, value);
      } else {
        Session.clear(name);
      }
    },

    initSessionFromUrl: function () {
      this.setSessionValueFromUrl('service');
      this.setSessionValueFromUrl('redirectTo');
      this.setSessionValueFromUrl('context');
      this.initOAuthService();
    },

    // If Session.service hasn't been set,
    // look for the service in the `client_id` parameter.
    initOAuthService: function () {
      if (! Session.service) {
        this.setSessionValueFromUrl('client_id', 'service');
      }
    }
  };

  return Start;
});
