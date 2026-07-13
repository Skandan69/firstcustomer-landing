const { searchGoogle } = require('./google');
const { searchOpenData } = require('./open-data');

async function discoverBusinesses(criteria, options = {}) {
  const provider = criteria.provider || 'auto';

  if (provider === 'google') {
    try { return await searchGoogle(criteria, { apiKey: options.googleApiKey }); }
    catch (error) { throw annotateError(error, 'google', 'google'); }
  }

  if (provider === 'open_data') {
    try { return await searchOpenData(criteria, options.openData); }
    catch (error) { throw annotateError(error, 'open_data', 'open_data'); }
  }

  let googleFailure;
  try {
    return await searchGoogle(criteria, { apiKey: options.googleApiKey });
  } catch (error) {
    googleFailure = annotateError(error, 'auto', 'google');
    if (!error.fallbackEligible) throw googleFailure;
  }

  try {
    const result = await searchOpenData(criteria, options.openData);
    const target = criteria.category ? ` for “${criteria.category}”` : '';
    return {
      ...result,
      fallback: {
        from: 'google',
        to: 'open_data',
        code: googleFailure.code,
        message: `Google Places is unavailable, so category-matched Open Data results${target} are shown instead.`,
        diagnostic: {
          requestedProvider: 'auto',
          originalGoogleFailure: safeFailure(googleFailure),
          attemptedProviders: ['google', 'open_data']
        }
      }
    };
  } catch (error) {
    const openDataFailure = annotateError(error, 'auto', 'open_data');
    const combined = new Error(`${googleFailure.message} ${openDataFailure.message}`);
    combined.code = 'AUTO_FALLBACK_FAILED';
    combined.status = openDataFailure.status || googleFailure.status || 502;
    combined.provider = 'auto';
    combined.requestedProvider = 'auto';
    combined.attemptedProviders = ['google', 'open_data'];
    combined.diagnostic = {
      requestedProvider: 'auto',
      originalGoogleFailure: safeFailure(googleFailure),
      openDataFailure: safeFailure(openDataFailure),
      attemptedProviders: ['google', 'open_data']
    };
    throw combined;
  }
}

function annotateError(error, requestedProvider, attemptedProvider) {
  error.provider = error.provider || attemptedProvider;
  error.requestedProvider = requestedProvider;
  error.attemptedProviders = [attemptedProvider];
  if (!error.diagnostic) error.diagnostic = {};
  error.diagnostic.requestedProvider = requestedProvider;
  error.diagnostic.attemptedProviders = [attemptedProvider];
  return error;
}

function safeFailure(error) {
  return {
    provider: error.provider || '',
    code: error.code || 'PROVIDER_FAILED',
    message: error.message || 'The provider request failed.',
    httpStatus: Number.isInteger(error.diagnostic?.httpStatus) ? error.diagnostic.httpStatus : null,
    providerStatus: error.diagnostic?.providerStatus || '',
    upstreamMessage: error.diagnostic?.upstreamMessage || ''
  };
}

module.exports = { discoverBusinesses, safeFailure };
