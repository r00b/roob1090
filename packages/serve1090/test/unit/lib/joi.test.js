const Joi = require('../../../src/lib/joi');

describe('joi', () => {
  test('it validates altitude', () => {
    const schema = Joi.object({
      a: Joi.altitude()
    });

    expect(schema.validate({
      a: 2000
    }).value).toEqual({
      a: 2000
    });

    expect(schema.validate({
      a: 'ground'
    }).value).toEqual({
      a: 0
    });
  });

  test('it validates a string or sets it to null', () => {
    const schema = Joi.object({
      a: Joi.stringOrNull()
    });

    expect(schema.validate({
      a: ''
    }).value).toEqual({
      a: null
    });

    expect(schema.validate({
      a: 'a'
    }).value).toEqual({
      a: 'a'
    });
  });

  test('it validates a number or sets it to null', () => {
    const schema = Joi.object({
      a: Joi.numberOrNull()
    });

    expect(schema.validate({
      a: 0
    }).value).toEqual({
      a: 0
    });

    expect(schema.validate({
      a: 1
    }).value).toEqual({
      a: 1
    });

    expect(schema.validate({
      a: -1
    }).value).toEqual({
      a: -1
    });

    expect(schema.validate({
      a: 'a'
    }).value).toEqual({
      a: null
    });
  });

  test('it validates a date or sets it to null', () => {
    const schema = Joi.object({
      a: Joi.dateOrNull()
    });

    expect(schema.validate({
      a: '1996-04-04'
    }).value).toEqual({
      a: new Date('1996-04-04')
    });

    expect(schema.validate({
      a: 1619398787623
    }).value).toEqual({
      a: new Date(1619398787623)
    });

    expect(schema.validate({
      a: null
    }).value).toEqual({
      a: null
    });

    expect(schema.validate({
      a: 'a'
    }).value).toEqual({
      a: null
    });
  });

  test('it converts hPa to inHg', () => {
    const schema = Joi.object({
      a: Joi.altimeter()
    });

    expect(schema.validate({
      a: 1013.6
    }).value).toEqual({
      a: 29.93
    });

    const { error } = schema.validate({
      a: 'foo'
    });
    expect(error).toBeDefined();
  });
});
