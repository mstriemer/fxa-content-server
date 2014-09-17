/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * stringify and parse the `resume` token that is set in the URL
 * search parameters post-verification in the OAuth flow
 */
'use strict';

define([], function () {
  var ResumeToken = {
    parse: function (resumeToken) {
      try {
        var resumeObj = JSON.parse(atob(resumeToken));
        return resumeObj;
      } catch(e) {
        // TODO - what should we do here?
      }
    },

    stringify: function (resumeObj) {
      var encoded = btoa(JSON.stringify(resumeObj));
      return encoded;
    }
  };

  return ResumeToken;
});



