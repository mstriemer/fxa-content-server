/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// It's a tooltip!

'use strict';

define([
  'underscore',
  'jquery',
  'views/base'
], function (_, $, BaseView) {
  var displayedTooltip;

  var Tooltip = BaseView.extend({
    tagName: 'aside',
    className: 'tooltip',

    initialize: function (options) {
      options = options || {};
      this.message = options.message || '';

      // the tooltip has to be attached to an element.
      // By default, the tooltip is displayed just above the
      // element. If the element has the 'tooltip-below' class, the
      // tooltip is displayed just below it.
      this.invalidEl = $(options.invalidEl);
    },

    template: function () {
      return this.translator.get(this.message);
    },

    afterRender: function () {
      // only one tooltip at a time!
      if (displayedTooltip) {
        displayedTooltip.destroy(true);
      }
      displayedTooltip = this;

      this.setInitialPosition();

      this.showTooltip();
 
      this.bindDOMEvents();
    },

    beforeDestroy: function () {
      displayedTooltip = null;

      // ditch the events we manually added to reduce interference
      // between tooltips.
      var invalidEl = this.invalidEl;
      invalidEl.off('keydown change', this._destroy);
      invalidEl.find('option').off('click', this._destroy);
    },

    setInitialPosition: function () {
      // by default, the position is above the input/select element
      // to show the tooltip below the element, we use JS to set
      // the top of the tooltip to be just below the element it is
      // attached to.
      var tooltipEl = this.$el;
      var invalidEl = this.invalidEl;
      if (invalidEl.hasClass('tooltip-below')) {
        tooltipEl.addClass('tooltip-below');
        tooltipEl.css({
          top: invalidEl.outerHeight() + 12  // magic number alert.
        });
      } else {
        tooltipEl.css({
          top: -40  // magic number alert.
        });
      }
    },

    showTooltip: function() {

      var tooltipContainer = this.invalidEl.closest('.input-row');
      var tooltipEl = this.$el;

      tooltipEl.appendTo(tooltipContainer);

      var initalOffsetTop = parseInt(this.el.style.top);

      if (tooltipEl.hasClass('tooltip-below')) {
          var finalOffsetTop = initalOffsetTop - 8;
          tooltipEl
            .css('opacity',0)
            .animate({top:finalOffsetTop,opacity:1},400);
      } else {
          var finalOffsetTop = initalOffsetTop + 8; 
          tooltipEl
            .css('opacity',0)
            .animate({top:finalOffsetTop,opacity:1},400);
      }
    },

    bindDOMEvents: function () {
      var invalidEl = this.invalidEl;

      // destroy the tooltip any time the user
      // interacts with the invalid element.
      this._destroy = _.bind(this.destroy, this, true);
      // keyboard input for input/select elements.
      invalidEl.one('keydown change', this._destroy);
      // handle selecting an option with the mouse for select elements
      invalidEl.find('option').one('click', this._destroy);
    }
  });

  return Tooltip;
});
