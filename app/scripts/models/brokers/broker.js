/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * A broker is a model that knows how to handle interaction with
 * the outside world.
 */
'use strict';

define([
  'backbone',
  'lib/promise'
], function (Backbone, p) {

  var Broker = Backbone.Model.extend({
    initialize: function (options) {
      options = options || {};

      this._relier = options.relier;
    },

    /**
     * initialize the broker with any necessary data.
     * @returns {Promise}
     */
    fetch: function () {
      return p();
    },

    /**
     * check whether the current environment is supported.
     * @returns {Promise}
     */
    checkSupport: function () {
      return p();
    },

    /**
     * Initialize the Session.
     * TODO: Perhaps should be merged into `fetch`
     * @returns {Promise}
     */
    initializeSession: function () {
      return p();
    },

    /**
     * Select the start page. Returned promise can resolve to a string that
     * will cause the start page to redirect. If returned promise resolves
     * to a 'falsy' value, no redirection will occur.
     * @returns {Promise}
     */
    selectStartPage: function () {
      // the default is to use the page set in the URL
      return p();
    },

    finishFlow: function () {
      return p();
    }
  });

  return Broker;
});
