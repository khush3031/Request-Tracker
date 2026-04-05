/**
 * NestJS Example — Request Tracker Pro
 *
 * Run:
 *   npm install @nestjs/core @nestjs/common @nestjs/platform-express reflect-metadata rxjs
 *   node examples/nestjs-app.js
 *
 * Then visit:
 *   http://localhost:3000/request-tracker   ← dashboard
 *   http://localhost:3000/api/users         ← tracked route
 *   http://localhost:3000/api/products      ← tracked route
 */

require('reflect-metadata');
const { NestFactory }        = require('@nestjs/core');
const { Module, Controller, Get, Post, Body, Param, Injectable, MiddlewareConsumer, NestMiddleware } = require('@nestjs/common');
const { RequestTrackerMiddleware, getTracker } = require('../dist/middleware/nestjs');
const express = require('express');
const { setupRequestTracker } = require('../dist/middleware/express');

// ─── Fake data ───────────────────────────────────────────────────────────────
const users    = [
  { id: 1, name: 'Alice Johnson', email: 'alice@example.com', role: 'admin' },
  { id: 2, name: 'Bob Smith',     email: 'bob@example.com',   role: 'user'  },
];
const products = [
  { id: 1, name: 'Laptop Pro',  price: 1299, category: 'electronics' },
  { id: 2, name: 'Desk Chair',  price: 349,  category: 'furniture'   },
];

// ─── Controllers ─────────────────────────────────────────────────────────────
@Controller('api/users')
class UsersController {
  @Get()        getAll()          { return { users, total: users.length }; }
  @Get(':id')   getOne(@Param('id') id) {
    const u = users.find(u => u.id === +id);
    return u ?? { error: 'Not found' };
  }
  @Post()       create(@Body() body) {
    const u = { id: users.length + 1, ...body };
    users.push(u); return u;
  }
}

@Controller('api/products')
class ProductsController {
  @Get()        getAll()          { return { products, total: products.length }; }
  @Get(':id')   getOne(@Param('id') id) {
    const p = products.find(p => p.id === +id);
    return p ?? { error: 'Not found' };
  }
}

@Controller('api')
class MiscController {
  @Get('health')   health()    { return { status: 'ok', uptime: process.uptime() }; }
  @Get('error/500') err500()   { throw new Error('Simulated 500'); }
}

// ─── App Module ───────────────────────────────────────────────────────────────
@Module({ controllers: [UsersController, ProductsController, MiscController] })
class AppModule {
  configure(consumer) {
    // Apply tracker middleware to all routes
    const middleware = new RequestTrackerMiddleware({ storage: { primary: 'file' } });
    consumer
      .apply((req, res, next) => middleware.use(req, res, next))
      .forRoutes('*');
  }
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────
async function bootstrap() {
  // Use Express adapter so we can add the HTML dashboard route
  const expressApp = express();
  const app = await NestFactory.create(AppModule, new (require('@nestjs/platform-express').ExpressAdapter)(expressApp));

  // Add CORS
  app.enableCors();

  // Add the HTML dashboard + JSON API routes from express middleware
  setupRequestTracker(expressApp, { storage: { primary: 'file' } });

  await app.listen(3000);

  console.log('\n✅ NestJS + Request Tracker running');
  console.log('   Dashboard:  http://localhost:3000/request-tracker');
  console.log('   Users API:  http://localhost:3000/api/users');
  console.log('   Products:   http://localhost:3000/api/products');
  console.log('   Health:     http://localhost:3000/api/health');
  console.log('   500 error:  http://localhost:3000/api/error/500');
}

bootstrap().catch(console.error);
