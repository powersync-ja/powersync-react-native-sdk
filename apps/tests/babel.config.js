module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      'nativewind/babel',
      '@babel/plugin-transform-async-generator-functions',
      [
        'module-resolver',
        {
          alias: {
            stream: 'stream-browserify'
          }
        }
      ]
    ]
  };
};
