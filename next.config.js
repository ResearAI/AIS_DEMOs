/** @type {import('next').NextConfig} */
const nextConfig = {
  // 启用实验性功能
  experimental: {
    // 优化第三方包导入，只加载实际使用的模块
    optimizePackageImports: [
      'lucide-react',
      '@/components/ui',
      'recharts'
    ],
  },

  // 编译优化
  compiler: {
    // 移除console.log (生产环境)
    removeConsole: process.env.NODE_ENV === 'production',
  },

  // 构建优化
  output: 'standalone',
  
  // 图片优化
  images: {
    // 启用图片优化
    unoptimized: false,
    // 格式优化
    formats: ['image/webp', 'image/avif'],
  },

  // 启用gzip压缩
  compress: true,

  // Webpack优化 - 统一配置
  webpack: (config, { dev, isServer }) => {
    // 生产环境的优化
    if (!dev && !isServer) {
      // 代码分割优化
      config.optimization.splitChunks = {
        chunks: 'all',
        cacheGroups: {
          // 将较大的第三方库单独打包
          vendor: {
            test: /[\\/]node_modules[\\/]/,
            name: 'vendors',
            priority: 10,
            reuseExistingChunk: true,
            chunks: 'initial',
          },
          // UI组件单独打包
          ui: {
            test: /[\\/]components[\\/]ui[\\/]/,
            name: 'ui-components',
            priority: 20,
            reuseExistingChunk: true,
          },
          // lucide图标单独打包
          icons: {
            test: /[\\/]node_modules[\\/]lucide-react[\\/]/,
            name: 'icons',
            priority: 30,
            reuseExistingChunk: true,
          }
        }
      };

      // 减少polyfill
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }

    // Bundle分析（当设置ANALYZE环境变量时）
    if (process.env.ANALYZE === 'true' && !isServer) {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          openAnalyzer: false,
          reportFilename: 'bundle-analyzer-report.html'
        })
      );
    }

    return config;
  },
};

module.exports = nextConfig;