const { Signale } = require("signale");

class Signal extends Signale {
  constructor(options = {}) {
    super(options);
    this._options = options;
  }

  /**
   * Allow for scoped loggers to be disabled via an exclude list
   *
   * @param name {string} - name of logger scope
   */
  scope(name) {
    const excluded = this._options.excluded || [];
    if (excluded.includes(name)) {
      return new Signal({
        ...this._options,
        scope: name,
        disabled: true,
      });
    } else {
      return new Signal({
        ...this._options,
        scope: name,
        disabled: false,
      });
    }
  }

  /**
   * Intercept Signale's _logger fn to capture child logs
   */
  _logger(type, ...messageObj) {
    if (this._options.meta) {
      if (messageObj[1]) {
        messageObj[1] = {
          ...messageObj[1],
          ...this._options.meta,
        };
      } else {
        messageObj.push(this._options.meta);
      }
      super._logger(type, ...messageObj);
    } else {
      super._logger(type, ...messageObj);
    }
  }

  /**
   * Create a child logger, attaching meta to every log it creates
   *
   * @param meta {object}
   */
  child(meta) {
    return new Signal({
      ...this._options,
      meta,
    });
  }
}

module.exports = Signal;
