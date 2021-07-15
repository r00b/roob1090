const Joi = require('../../../src/lib/joi');

describe('joi', () => {
  test('validates altitude', () => {
    const schema = Joi.object({
      a: Joi.altitude()
    });

    let res = schema.validate({
      a: 2000
    });
    expect(res.value).toEqual({
      a: 2000
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: 'ground'
    });
    expect(res.value).toEqual({
      a: 0
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: 'a'
    });
    expect(res.error).toBeDefined();
  });

  test('validates a string or sets it to null', () => {
    const schema = Joi.object({
      a: Joi.stringOrNull()
    });

    let res = schema.validate({
      a: ''
    });
    expect(res.value).toEqual({
      a: null
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: 'a'
    });
    expect(res.value).toEqual({
      a: 'a'
    });
    expect(res.error).toBeUndefined();
  });

  test('validates a number or sets it to null', () => {
    const schema = Joi.object({
      a: Joi.numberOrNull()
    });

    let res = schema.validate({
      a: 0
    });
    expect(res.value).toEqual({
      a: 0
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: 1
    });
    expect(res.value).toEqual({
      a: 1
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: -1
    });
    expect(res.value).toEqual({
      a: -1
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: 'a'
    });
    expect(res.value).toEqual({
      a: null
    });
    expect(res.error).toBeUndefined();
  });

  test('validates a date or sets it to null', () => {
    const schema = Joi.object({
      a: Joi.dateOrNull()
    });

    let res = schema.validate({
      a: '1996-04-04'
    });
    expect(res.value).toEqual({
      a: new Date('1996-04-04')
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: 1619398787623
    });
    expect(res.value).toEqual({
      a: new Date(1619398787623)
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: null
    });
    expect(res.value).toEqual({
      a: null
    });

    res = schema.validate({
      a: 'a'
    });
    expect(res.value).toEqual({
      a: null
    });
    expect(res.error).toBeUndefined();
  });

  test('converts hPa to inHg', () => {
    const schema = Joi.object({
      a: Joi.altimeter()
    });

    let res = schema.validate({
      a: 1013.6
    });
    expect(res.value).toEqual({
      a: 29.93
    });
    expect(res.error).toBeUndefined();

    res = schema.validate({
      a: 'foo'
    });
    expect(res.error).toBeDefined();
  });
});
