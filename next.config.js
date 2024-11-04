// next.config.js
module.exports = {
    async rewrites() {
      return [
        {
          source: '/',
          destination: '/index.html',
        },
      ];
    },
  };