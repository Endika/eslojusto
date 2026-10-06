import { describe, expect, it } from 'vitest';
import type { CaptureResult } from 'posthog-js';
import { cleanEvent, cleanProperties, cleanUrl } from '../../src/analytics/sanitize';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/153.0 Safari/537.36';

describe('only the listed properties leave', () => {
  it('the URL keeps origin and path, with the hash only when it is a section', () => {
    expect(cleanUrl('https://eslojusto.es/finiquito/?gclid=ABC123&utm_source=x#causa')).toBe(
      'https://eslojusto.es/finiquito/#causa',
    );
    expect(cleanUrl('https://eslojusto.es/finiquito/#pagas')).toBe(
      'https://eslojusto.es/finiquito/#pagas',
    );
    expect(cleanUrl('https://eslojusto.es/finiquito/#1500')).toBe(
      'https://eslojusto.es/finiquito/',
    );
    expect(cleanUrl('no es una url')).toBe('');
  });

  it('keeps what answers a product question and the technical keys; drops everything else', () => {
    const clean = cleanProperties({
      token: 'phc_x',
      distinct_id: 'd',
      $device_id: 'd',
      $session_id: 's',
      $window_id: 'w',
      $pageview_id: 'p',
      $insert_id: 'i',
      $time: 1,
      $lib: 'web',
      $lib_version: '1.437.0',
      $process_person_profile: false,
      $current_url: 'https://eslojusto.es/?fbclid=X1#resultado',
      $pathname: '/',
      $host: 'eslojusto.es',
      $referring_domain: 'www.google.com',
      utm_source: 'boletin',
      utm_medium: null,
      utm_campaign: 'otono',
      $browser: 'Chrome',
      $browser_version: 153,
      $os: 'Windows',
      $device_type: 'Desktop',
      $viewport_width: 1280,
      $viewport_height: 720,
      $prev_pageview_duration: 12.5,
      $prev_pageview_max_scroll_percentage: 0.4,
      section: 'causa',
      // Dropped:
      $referrer: 'https://www.google.com/search?q=finiquito+1500',
      $raw_user_agent: UA,
      $os_version: '10',
      $browser_language: 'ja-JP',
      $browser_language_prefix: 'ja',
      $timezone: 'Europe/Madrid',
      $timezone_offset: -120,
      $screen_width: 1280,
      $screen_height: 720,
      $device: 'iPhone',
      title: 'Revisar finiquito',
      $search_engine: 'google',
      ph_keyword: 'finiquito 1500',
      utm_term: 'mi nombre',
      gclid: 'ABC123',
      $session_entry_url: 'https://eslojusto.es/?msclkid=X2',
      $session_entry_utm_source: 'boletin',
      $initial_referrer: 'https://x.es/?a=1',
      $prev_pageview_id: 'p0',
      $prev_pageview_max_content: 1220,
      $prev_pageview_last_scroll: 500,
      $prev_pageview_pathname: '/',
      $sdk_debug_retry_queue_size: 0,
      $lib_rate_limit_remaining_tokens: 98.4,
      $initialization_time: '2026-10-06T10:00:00Z',
      $configured_session_timeout_ms: 1800000,
      $recording_status: 'disabled',
      $is_identified: false,
      $config_defaults: 'unset',
    });
    expect(Object.keys(clean).toSorted()).toEqual(
      [
        'token',
        'distinct_id',
        '$device_id',
        '$session_id',
        '$window_id',
        '$pageview_id',
        '$insert_id',
        '$time',
        '$lib',
        '$lib_version',
        '$process_person_profile',
        '$current_url',
        '$pathname',
        '$host',
        '$referring_domain',
        'utm_source',
        'utm_campaign',
        '$browser',
        '$browser_version',
        '$os',
        '$device_type',
        '$viewport_width',
        '$viewport_height',
        '$prev_pageview_duration',
        '$prev_pageview_max_scroll_percentage',
        'section',
      ].toSorted(),
    );
    expect(clean['$current_url']).toBe('https://eslojusto.es/#resultado');
    expect(JSON.stringify(clean)).not.toMatch(
      /ABC123|1500|ja-JP|Mozilla|Madrid|google\.com\/search/,
    );
  });

  it('$set and $set_once go through the same list and vanish when left empty', () => {
    const event = {
      uuid: 'u',
      event: '$pageview',
      properties: { gclid: 'ABC123', $os: 'Windows' },
      $set: { $browser: 'Chrome', email: 'x@y.es' },
      $set_once: { $initial_gclid: 'ABC123', $initial_current_url: 'https://e.es/?a=1' },
    } satisfies CaptureResult;
    expect(cleanEvent(event)).toEqual({
      uuid: 'u',
      event: '$pageview',
      properties: { $os: 'Windows' },
      $set: { $browser: 'Chrome' },
    });
    expect(cleanEvent(null)).toBeNull();
  });
});
