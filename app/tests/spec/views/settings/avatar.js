/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

'use strict';


define([
  'chai',
  'underscore',
  'jquery',
  'sinon',
  'views/settings/avatar',
  '../../../mocks/router',
  '../../../mocks/profile',
  'lib/promise',
  'lib/session',
  'lib/profile'
],
function (chai, _, $, sinon, View, RouterMock, ProfileMock, p, Session, Profile) {
  var assert = chai.assert;
  var pngSrc = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVQYV2P4DwABAQEAWk1v8QAAAABJRU5ErkJggg==';
  var IMG_URL = 'http://127.0.0.1:1112/avatar/example.jpg';

  describe('views/settings/avatar', function () {
    var view;
    var routerMock;
    var profileClientMock;

    beforeEach(function () {
      routerMock = new RouterMock();
      profileClientMock = new ProfileMock();

      view = new View({
        router: routerMock,
        profileClient: profileClientMock
      });
    });

    afterEach(function () {
      $(view.el).remove();
      view.destroy();
      view = null;
      routerMock = null;
      profileClientMock = null;
    });

    describe('with no session', function () {
      it('redirects to signin', function() {
        view.isUserAuthorized = function () {
          return false;
        };
        return view.render()
          .then(function () {
            assert.equal(routerMock.page, 'signin');
          });
      });
    });

    describe('with session', function () {

      beforeEach(function () {
        view.isUserAuthorized = function () {
          return true;
        };
      });

      it('has no avatar set', function () {
        Session.clear('avatar');

        sinon.stub(profileClientMock, 'getAvatar', function () {
          return p({});
        });

        return view.render()
          .then(function () {
            assert.isTrue(view.$('.avatar-wrapper img.default').length > 0);
          });
      });

      it('has an avatar set', function () {
        Session.set('avatar', pngSrc);
        Session.set('avatarId', 'foo');

        return view.render()
          .then(function () {
            assert.equal(view.$('.avatar-wrapper img').attr('src'), pngSrc);
          });
      });

      it('loads an avatar from the server', function () {
        Session.clear('avatar');
        var id = 'foo';

        sinon.stub(profileClientMock, 'getAvatar', function () {
          return p({
            avatar: IMG_URL,
            id: id
          });
        });

        return view.render()
          .then(function () {
            assert.equal(view.$('.avatar-wrapper img').attr('src'), IMG_URL);
            assert.equal(Session.avatarId, id);
          });
      });
    });
  });
});


