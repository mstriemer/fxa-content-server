/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

(function () {
  'use strict';

  var FXA_HOST = 'http://127.0.0.1:3030';

  function bind(func, context) {
    return function() {
      var args = [].slice.call(arguments, 0);
      func.apply(context, args);
    };
  }

  function defer(callback) {
    var args = [].slice.call(arguments, 1);
    setTimeout(function() {
      callback.apply(null, args);
    }, 0);
  }


  function complete(arr, val) {
    /*jshint validthis: true*/
    if (this._callbacks) {
      var info;
      /*jshint boss: true*/
      while (info = this._callbacks.shift()) {
        var promise = info.promise;
        try {
          var returnedVal = this._value;
          if (typeof info[this._state] === 'function') {
            returnedVal = info[this._state](this._value);
            if (returnedVal && typeof returnedVal.then === 'function') {
              var fulfill = bind(promise.fulfill, promise);
              var reject = bind(promise.reject, promise);
              return returnedVal.then(fulfill, reject);
            }

            defer(bind(promise.fulfill, promise), returnedVal);
          } else {
            defer(bind(promise[this._state], promise), returnedVal);
          }

        } catch(e) {
          defer(bind(promise.reject, promise), e);
        }
      }
    }
  }

  var Promise = function() {};
  Promise.prototype = {
    _state: 'pending',
    then: function(onFulfilled, onRejected) {
      if (!this._callbacks) {
        this._callbacks = [];
      }

      var returnedPromise = new Promise();

      this._callbacks.push({
        fulfill: onFulfilled,
        reject: onRejected,
        promise: returnedPromise
      });


      if (this._state === 'fulfill' || this._state === 'reject') {
        defer(bind(complete, this));
      }

      return returnedPromise;
    },

    fulfill: function(value) {
      if (this._state !== 'pending') {
        throw new Error('promise already completed');
      }

      this._value = value;
      this._state = 'fulfill';

      complete.call(this);
      return this;
    },

    reject: function(reason) {
      if (this._state !== 'pending') {
        throw new Error('promise already completed');
      }

      this._value = reason;
      this._state = 'reject';

      complete.call(this);
      return this;
    },

    otherwise: function(func) {
      return this.then(null, func);
    },

    ensure: function(func) {
      return this.then(func, func);
    }
  };


  function cssPropsToString(props) {
    var str = '';

    for (var key in props) {
      str += key + ':' + props[key] + ';';
    }

    return str;
  }

  function getIframeSrc(options) {
    if (options.redirectTo) {
      return options.redirectTo;
    }
    return FXA_HOST + '/' + options.page;
  }

  navigator.mozAccounts = {
    get: function (options) {
      var background = document.createElement('div');
      background.setAttribute('style', cssPropsToString({
        background: 'rgba(0,0,0,0.8)',
        bottom: 0,
        left: 0,
        position: 'fixed',
        right: 0,
        top: 0
      }));


      var iframe = document.createElement('iframe');
      var src = getIframeSrc(options);
      iframe.setAttribute('src', src);
      iframe.setAttribute('width', '400');
      iframe.setAttribute('height', '600');
      iframe.setAttribute('border', '0');
      iframe.setAttribute('style', cssPropsToString({
        background: '#fff',
        border: 'none',
        display: 'block',
        height: '600px',
        left: '50%',
        margin: '-300px 0 0 -200px',
        position: 'fixed',
        top: '40%',
        width: '400px'
      }));
      background.appendChild(iframe);
      document.body.appendChild(background);

      var promise = new Promise();

      window.addEventListener('message', function receiveMessage(event) {
        if (event.origin !== FXA_HOST) {
          return;
        }

        document.body.removeChild(background);

        console.log('received a message: ' + event.data);
        var components = event.data.split('!!!');
        var command = components[0];
        var data = JSON.parse(components[1]);

        if (command === 'error') {
          return promise.reject(data);
        }

        promise.fulfil({
          command: command,
          data: data
        });
      }, false);

      return promise();
    }
  };

}());
