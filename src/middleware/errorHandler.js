export const errorHandler = (err, req, res, next) => {
  console.error('[SERVER ERROR]', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const code = err.code || 'INTERNAL_ERROR';

  res.status(statusCode).json({
    data: null,
    error: {
      message,
      code
    }
  });
};
