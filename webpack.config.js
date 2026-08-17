const path = require('path');
const { VueLoaderPlugin } = require('vue-loader');
const manifest = require('./gl-plugin.json');
const runtimeDir = process.env.GL_SDK4_PLUGIN_KIT_RUNTIME;

module.exports = {
  mode: 'production',
  entry: {
    'starlink-monitor': './src/index.vue',
    'starlink-monitor-dish': './src/dish.vue',
    'starlink-monitor-sky': './src/sky.vue',
    'starlink-monitor-network': './src/network.vue',
    'starlink-monitor-tools': './src/tools.vue',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'gl-sdk4-ui-[name].common.js',
    libraryTarget: 'commonjs2',
    libraryExport: 'default',
  },
  externals: {
    vue: 'vue',
  },
  module: {
    rules: [
      {
        test: /\.vue$/,
        loader: 'vue-loader',
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['vue-style-loader', 'css-loader'],
      },
      {
        test: /\.protoset$/,
        type: 'asset/inline',
        generator: {
          dataUrl: {
            encoding: 'base64',
            mimetype: 'application/octet-stream',
          },
        },
      },
    ],
  },
  plugins: [new VueLoaderPlugin()],
  resolve: {
    extensions: ['.js', '.vue'],
    alias: runtimeDir ? {
      '@gl-sdk4-plugin-kit': runtimeDir,
    } : {},
  },
};
