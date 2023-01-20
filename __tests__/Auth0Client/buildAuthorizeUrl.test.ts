import 'fast-text-encoding';
import unfetch from 'unfetch';
import { verify } from '../../src/jwt';
import { MessageChannel } from 'worker_threads';
import * as utils from '../../src/utils';
import * as scope from '../../src/scope';

// @ts-ignore

import { assertUrlEquals, setupFn } from './helpers';

import { TEST_CLIENT_ID, TEST_CODE_CHALLENGE, TEST_DOMAIN, TEST_NONCE, TEST_REDIRECT_URI, TEST_SCOPES, TEST_STATE } from '../constants';

jest.mock('unfetch');
jest.mock('es-cookie');
jest.mock('../../src/jwt');
jest.mock('../../src/worker/token.worker');

const mockWindow = <any>global;
const mockFetch = (mockWindow.fetch = <jest.Mock>unfetch);
const mockVerify = <jest.Mock>verify;

jest
  .spyOn(utils, 'bufferToBase64UrlEncoded')
  .mockReturnValue(TEST_CODE_CHALLENGE);

jest.spyOn(utils, 'runPopup');

const setup = setupFn(mockVerify);

describe('Auth0Client', () => {
  const oldWindowLocation = window.location;

  beforeEach(() => {
    // https://www.benmvp.com/blog/mocking-window-location-methods-jest-jsdom/
    delete (window as any).location;
    window.location = Object.defineProperties(
      {},
      {
        ...Object.getOwnPropertyDescriptors(oldWindowLocation),
        assign: {
          configurable: true,
          value: jest.fn()
        }
      }
    ) as Location;
    // --

    mockWindow.open = jest.fn();
    mockWindow.addEventListener = jest.fn();
    mockWindow.crypto = {
      subtle: {
        digest: () => 'foo'
      },
      getRandomValues() {
        return '123';
      }
    };
    mockWindow.MessageChannel = MessageChannel;
    mockWindow.Worker = {};
    jest.spyOn(scope, 'getUniqueScopes');
    sessionStorage.clear();
  });

  afterEach(() => {
    mockFetch.mockReset();
    jest.clearAllMocks();
    window.location = oldWindowLocation;
  });

  describe('buildAuthorizeUrl', () => {
    it('creates correct query params with empty options', async () => {
      const auth0 = setup();

      const url = await auth0.buildAuthorizeUrl();

      assertUrlEquals(url, TEST_DOMAIN, '/authorize', {
        client_id: TEST_CLIENT_ID,
        code_challenge: TEST_CODE_CHALLENGE,
        code_challenge_method: 'S256',
        nonce: TEST_NONCE,
        redirect_uri: TEST_REDIRECT_URI,
        response_mode: 'query',
        response_type: 'code',
        scope: TEST_SCOPES,
        state: TEST_STATE
        // domain: TEST_DOMAIN,
        // redirect_uri: TEST_REDIRECT_URI,
      });
    });

    // it('creates correct query params with `options.client_id` is null', async () => {
    //   const auth0 = setup();

    //   const url = new URL(await auth0.buildAuthorizeUrl({ client_id: null }));
    //   expect(url.searchParams.get('client_id')).toBeNull();
    // });

    it('creates correct query params with `options.client_id` defined', async () => {
      const auth0 = setup({ client_id: 'another-client-id' });

      const url = await auth0.buildAuthorizeUrl();

      assertUrlEquals(url, TEST_DOMAIN, '/authorize', {
        client_id: 'another-client-id',
        code_challenge: TEST_CODE_CHALLENGE,
        code_challenge_method: 'S256',
        nonce: TEST_NONCE,
        redirect_uri: TEST_REDIRECT_URI,
        response_mode: 'query',
        response_type: 'code',
        scope: TEST_SCOPES,
        state: TEST_STATE
      });
    });

    it('creates correct query params with `client_id`, `domain`, and `redirect_uri` defined', async () => {
      const anotherDomain = 'another-domain.com';
      const auth0 = setup({ client_id: 'another-client-id', domain: `https://${anotherDomain}`, redirect_uri: 'https://another-redirect-uri.com' });

      const url = await auth0.buildAuthorizeUrl();

      assertUrlEquals(url, anotherDomain, '/authorize', {
        client_id: 'another-client-id',
        code_challenge: TEST_CODE_CHALLENGE,
        code_challenge_method: 'S256',
        nonce: TEST_NONCE,
        redirect_uri: 'https://another-redirect-uri.com',
        response_mode: 'query',
        response_type: 'code',
        scope: TEST_SCOPES,
        state: TEST_STATE
      });
    });

    it('creates correct query params with `client_id`, `domain`, `redirect_uri`, `audience`, and `authorizePath` defined', async () => {
      const anotherDomain = 'another-domain.com';
      const auth0 = setup({
        domain: `https://${anotherDomain}`,
        client_id: 'another-client-id',
        cacheLocation: 'localstorage',
        audience: 'test-audience',
        authorizePath: 'auth',
        redirect_uri: 'https://another-redirect-uri.com'
      });

      const url = await auth0.buildAuthorizeUrl();

      assertUrlEquals(url, anotherDomain, '/auth', {
        audience: 'test-audience',
        client_id: 'another-client-id',
        code_challenge: TEST_CODE_CHALLENGE,
        code_challenge_method: 'S256',
        nonce: TEST_NONCE,
        redirect_uri: 'https://another-redirect-uri.com',
        response_mode: 'query',
        response_type: 'code',
        scope: TEST_SCOPES,
        state: TEST_STATE
      });
    });

    it('creates correct query params when `options.authorizePath` is set', async () => {
      const auth0 = setup({ authorizePath: 'auth' });

      const url = await auth0.buildAuthorizeUrl();

      assertUrlEquals(url, TEST_DOMAIN, '/auth', {
        client_id: TEST_CLIENT_ID,
        code_challenge: TEST_CODE_CHALLENGE,
        code_challenge_method: 'S256',
        nonce: TEST_NONCE,
        redirect_uri: TEST_REDIRECT_URI,
        response_mode: 'query',
        response_type: 'code',
        scope: TEST_SCOPES,
        state: TEST_STATE
      });
    });
  });
});
