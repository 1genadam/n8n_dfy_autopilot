const express = require('express');
const Joi = require('joi');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { query, transaction } = require('../config/database');
const { addJob, queueNames } = require('../config/queues');
const { cache, cacheKeys } = require('../config/redis');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation schemas
const createPaymentIntentSchema = Joi.object({
  request_id: Joi.number().integer().positive().required(),
  customer_email: Joi.string().email().required(),
  amount: Joi.number().positive().required(),
  currency: Joi.string().default('usd'),
  payment_method_types: Joi.array().items(Joi.string()).default(['card']),
});

const confirmPaymentSchema = Joi.object({
  payment_intent_id: Joi.string().required(),
  payment_method: Joi.string().required(),
});

// Create payment intent for customer request
router.post('/create-payment-intent', async (req, res) => {
  try {
    const { error, value } = createPaymentIntentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { request_id, customer_email, amount, currency, payment_method_types } = value;

    // Verify customer request exists and get details
    const requestResult = await query(
      'SELECT * FROM customer_requests WHERE id = $1',
      [request_id]
    );

    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'Customer request not found',
      });
    }

    const customerRequest = requestResult.rows[0];

    // Check if payment already exists for this request
    const existingPayment = await query(
      'SELECT * FROM payments WHERE request_id = $1 AND status IN ($2, $3)',
      [request_id, 'succeeded', 'pending']
    );

    if (existingPayment.rows.length > 0) {
      return res.status(400).json({
        error: 'Payment Already Exists',
        message: 'Payment already exists for this request',
      });
    }

    // Create or retrieve Stripe customer
    let stripeCustomer;
    try {
      const customers = await stripe.customers.list({
        email: customer_email,
        limit: 1,
      });

      if (customers.data.length > 0) {
        stripeCustomer = customers.data[0];
      } else {
        stripeCustomer = await stripe.customers.create({
          email: customer_email,
          name: customerRequest.customer_name,
          metadata: {
            request_id: request_id.toString(),
            company: customerRequest.company || '',
          },
        });
      }
    } catch (stripeError) {
      logger.error('Error creating/retrieving Stripe customer:', stripeError);
      return res.status(500).json({
        error: 'Payment Service Error',
        message: 'Failed to initialize customer in payment system',
      });
    }

    // Create payment intent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100), // Convert to cents
      currency,
      customer: stripeCustomer.id,
      payment_method_types,
      metadata: {
        request_id: request_id.toString(),
        customer_email,
        complexity: customerRequest.complexity,
      },
      description: `n8n Workflow Generation - Request #${request_id}`,
    });

    // Store payment record in database
    const paymentResult = await transaction(async (client) => {
      const insertQuery = `
        INSERT INTO payments (
          request_id, stripe_payment_intent_id, stripe_customer_id,
          amount, currency, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
        RETURNING id, created_at
      `;

      const result = await client.query(insertQuery, [
        request_id,
        paymentIntent.id,
        stripeCustomer.id,
        amount,
        currency,
        'pending',
      ]);

      return result.rows[0];
    });

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'payment_intent_created',
      request_id,
      event_data: {
        amount,
        currency,
        stripe_customer_id: stripeCustomer.id,
        payment_intent_id: paymentIntent.id,
      },
    });

    res.json({
      message: 'Payment intent created successfully',
      client_secret: paymentIntent.client_secret,
      payment_intent_id: paymentIntent.id,
      amount,
      currency,
      payment_id: paymentResult.id,
    });

  } catch (error) {
    logger.error('Error creating payment intent:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create payment intent',
    });
  }
});

// Confirm payment and start workflow processing
router.post('/confirm-payment', async (req, res) => {
  try {
    const { error, value } = confirmPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { payment_intent_id, payment_method } = value;

    // Confirm payment with Stripe
    const paymentIntent = await stripe.paymentIntents.confirm(payment_intent_id, {
      payment_method,
    });

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        error: 'Payment Failed',
        message: 'Payment could not be confirmed',
        status: paymentIntent.status,
      });
    }

    // Update payment and request status in database
    const result = await transaction(async (client) => {
      // Update payment status
      const paymentUpdate = await client.query(
        `UPDATE payments 
         SET status = 'succeeded', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE stripe_payment_intent_id = $1
         RETURNING request_id, id`,
        [payment_intent_id]
      );

      if (paymentUpdate.rows.length === 0) {
        throw new Error('Payment record not found');
      }

      const { request_id, id: payment_id } = paymentUpdate.rows[0];

      // Update customer request status to paid
      const requestUpdate = await client.query(
        `UPDATE customer_requests 
         SET status = 'paid', payment_confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING *`,
        [request_id]
      );

      return {
        payment_id,
        request_id,
        customer_request: requestUpdate.rows[0],
      };
    });

    // Clear relevant caches
    await cache.del(cacheKeys.customerRequest(result.request_id));

    // Start workflow generation immediately
    await addJob(queueNames.WORKFLOW_GENERATION, 'generate-workflow', {
      request_id: result.request_id,
      request_data: result.customer_request,
      payment_confirmed: true,
    }, {
      priority: 1, // High priority for paid requests
    });

    // Send payment confirmation email
    await addJob(queueNames.EMAIL_NOTIFICATIONS, 'send-email', {
      type: 'payment_confirmed',
      to: result.customer_request.customer_email,
      data: {
        request_id: result.request_id,
        customer_name: result.customer_request.customer_name,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
      },
    });

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'payment_confirmed',
      request_id: result.request_id,
      event_data: {
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        payment_method: payment_method,
      },
    });

    res.json({
      message: 'Payment confirmed successfully',
      payment_intent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
      },
      request_id: result.request_id,
      processing_started: true,
    });

  } catch (error) {
    logger.error('Error confirming payment:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to confirm payment',
    });
  }
});

// Handle Stripe webhooks
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        await handlePaymentSuccess(event.data.object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentFailure(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object);
        break;
      default:
        logger.info(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get payment status
router.get('/status/:request_id', async (req, res) => {
  try {
    const requestId = parseInt(req.params.request_id);
    if (isNaN(requestId)) {
      return res.status(400).json({
        error: 'Invalid Request ID',
        message: 'Request ID must be a number',
      });
    }

    const result = await query(
      `SELECT p.*, cr.customer_email, cr.customer_name, cr.estimated_price
       FROM payments p
       JOIN customer_requests cr ON p.request_id = cr.id
       WHERE p.request_id = $1
       ORDER BY p.created_at DESC
       LIMIT 1`,
      [requestId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No payment found for this request',
      });
    }

    const payment = result.rows[0];

    res.json({
      payment: {
        id: payment.id,
        request_id: payment.request_id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        created_at: payment.created_at,
        confirmed_at: payment.confirmed_at,
      },
    });

  } catch (error) {
    logger.error('Error fetching payment status:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch payment status',
    });
  }
});

// Create subscription for recurring customers
router.post('/create-subscription', async (req, res) => {
  try {
    const subscriptionSchema = Joi.object({
      customer_email: Joi.string().email().required(),
      price_id: Joi.string().required(),
      payment_method: Joi.string().required(),
    });

    const { error, value } = subscriptionSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation Error',
        message: error.details[0].message,
      });
    }

    const { customer_email, price_id, payment_method } = value;

    // Get or create Stripe customer
    const customers = await stripe.customers.list({
      email: customer_email,
      limit: 1,
    });

    let customer;
    if (customers.data.length > 0) {
      customer = customers.data[0];
    } else {
      customer = await stripe.customers.create({
        email: customer_email,
      });
    }

    // Attach payment method to customer
    await stripe.paymentMethods.attach(payment_method, {
      customer: customer.id,
    });

    // Set as default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: payment_method,
      },
    });

    // Create subscription
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: price_id }],
      payment_settings: {
        payment_method_types: ['card'],
        save_default_payment_method: 'on_subscription',
      },
      expand: ['latest_invoice.payment_intent'],
    });

    // Store subscription in database
    await transaction(async (client) => {
      await client.query(
        `INSERT INTO subscriptions (
          customer_email, stripe_customer_id, stripe_subscription_id,
          status, current_period_start, current_period_end, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)`,
        [
          customer_email,
          customer.id,
          subscription.id,
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
        ]
      );
    });

    res.json({
      message: 'Subscription created successfully',
      subscription: {
        id: subscription.id,
        status: subscription.status,
        current_period_end: subscription.current_period_end,
      },
    });

  } catch (error) {
    logger.error('Error creating subscription:', error);
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create subscription',
    });
  }
});

// Helper functions for webhook handling
async function handlePaymentSuccess(paymentIntent) {
  try {
    await transaction(async (client) => {
      await client.query(
        `UPDATE payments 
         SET status = 'succeeded', confirmed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id]
      );
    });

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'payment_webhook_success',
      event_data: {
        payment_intent_id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
      },
    });

    logger.info(`Payment succeeded webhook processed for ${paymentIntent.id}`);
  } catch (error) {
    logger.error('Error handling payment success webhook:', error);
  }
}

async function handlePaymentFailure(paymentIntent) {
  try {
    await transaction(async (client) => {
      await client.query(
        `UPDATE payments 
         SET status = 'failed', updated_at = CURRENT_TIMESTAMP
         WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id]
      );
    });

    // Track analytics
    await addJob(queueNames.ANALYTICS, 'track-event', {
      event_type: 'payment_webhook_failed',
      event_data: {
        payment_intent_id: paymentIntent.id,
        amount: paymentIntent.amount / 100,
      },
    });

    logger.info(`Payment failed webhook processed for ${paymentIntent.id}`);
  } catch (error) {
    logger.error('Error handling payment failure webhook:', error);
  }
}

async function handleSubscriptionCreated(subscription) {
  try {
    await transaction(async (client) => {
      await client.query(
        `UPDATE subscriptions 
         SET status = $1, updated_at = CURRENT_TIMESTAMP
         WHERE stripe_subscription_id = $2`,
        [subscription.status, subscription.id]
      );
    });

    logger.info(`Subscription created webhook processed for ${subscription.id}`);
  } catch (error) {
    logger.error('Error handling subscription created webhook:', error);
  }
}

async function handleSubscriptionUpdated(subscription) {
  try {
    await transaction(async (client) => {
      await client.query(
        `UPDATE subscriptions 
         SET status = $1, current_period_start = $2, current_period_end = $3, updated_at = CURRENT_TIMESTAMP
         WHERE stripe_subscription_id = $4`,
        [
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
          subscription.id,
        ]
      );
    });

    logger.info(`Subscription updated webhook processed for ${subscription.id}`);
  } catch (error) {
    logger.error('Error handling subscription updated webhook:', error);
  }
}

async function handleSubscriptionCanceled(subscription) {
  try {
    await transaction(async (client) => {
      await client.query(
        `UPDATE subscriptions 
         SET status = 'canceled', canceled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
         WHERE stripe_subscription_id = $1`,
        [subscription.id]
      );
    });

    logger.info(`Subscription canceled webhook processed for ${subscription.id}`);
  } catch (error) {
    logger.error('Error handling subscription canceled webhook:', error);
  }
}

module.exports = router;