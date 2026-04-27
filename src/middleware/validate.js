export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);

  if (!result.success) {
    return res.status(400).json({
      data: null,
      error: {
        message: 'Validation error',
        details: result.error.errors
      }
    });
  }

  next();
};

export default validate;
