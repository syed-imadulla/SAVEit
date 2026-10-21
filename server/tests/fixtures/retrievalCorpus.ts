import { Platform } from '../../src/models/Item';

export type BenchmarkCategory =
  | 'speech_heavy'
  | 'code_text_heavy'
  | 'captioned'
  | 'inaccessible';

export type ExpectedAccessLevel =
  | 'full'
  | 'transcript_only'
  | 'metadata_only'
  | 'inaccessible';

export interface BenchmarkItem {
  id: string;
  name: string;
  category: BenchmarkCategory;
  platform: Platform;
  url: string;
  expectedAccessLevel: ExpectedAccessLevel;
  description: string;
}

/**
 * Curated benchmark test corpus containing verified, representative public URLs
 * across the 4 key evaluation categories.
 */
export const RETRIEVAL_BENCHMARK_CORPUS: BenchmarkItem[] = [
  // 1. Speech-heavy public videos
  {
    id: 'yt-speech-01',
    name: 'YouTube Shorts: How principled coders outperform (Coderized)',
    category: 'speech_heavy',
    platform: Platform.YOUTUBE,
    url: 'https://www.youtube.com/shorts/q1qKv5TBaOA',
    expectedAccessLevel: 'metadata_only',
    description: 'Tech talk & software engineering mindset video with continuous spoken voiceover.',
  },
  {
    id: 'ig-speech-01',
    name: 'Instagram Reel: Engineering discussion / podcast snippet',
    category: 'speech_heavy',
    platform: Platform.INSTAGRAM,
    url: 'https://www.instagram.com/reel/C8qLqL-A0B1/',
    expectedAccessLevel: 'inaccessible',
    description: 'Public Instagram reel tested against unauthenticated web access / login boundaries.',
  },

  // 2. Code/Text-heavy public videos
  {
    id: 'yt-code-01',
    name: 'YouTube Shorts: Web Player Customization (Google for Developers)',
    category: 'code_text_heavy',
    platform: Platform.YOUTUBE,
    url: 'https://www.youtube.com/shorts/M7lc1UVf-VE',
    expectedAccessLevel: 'metadata_only',
    description: 'Developer tutorial demonstrating embedded player API code and configuration parameters.',
  },
  {
    id: 'ig-code-01',
    name: 'Instagram Reel: Visual code tips & UI tricks',
    category: 'code_text_heavy',
    platform: Platform.INSTAGRAM,
    url: 'https://www.instagram.com/reel/C3_V_v7LqK8/',
    expectedAccessLevel: 'inaccessible',
    description: 'Developer tips reel displaying IDE layout, shortcuts, and code blocks.',
  },

  // 3. Official / Verified Captioned videos
  {
    id: 'yt-caption-01',
    name: 'YouTube Shorts: Squid Game in Real Life (18 Subtitle Tracks)',
    category: 'captioned',
    platform: Platform.YOUTUBE,
    url: 'https://www.youtube.com/shorts/0e3GPea1Tyg',
    expectedAccessLevel: 'metadata_only',
    description: 'Video with 18 international caption tracks verified in player metadata.',
  },

  // 4. Inaccessible, Deleted, Private, or Invalid targets
  {
    id: 'yt-inaccessible-404',
    name: 'YouTube Shorts: Non-existent video ID (404 Not Found)',
    category: 'inaccessible',
    platform: Platform.YOUTUBE,
    url: 'https://www.youtube.com/shorts/00000000000',
    expectedAccessLevel: 'inaccessible',
    description: 'Invalid YouTube short ID returning 404 Not Found on oEmbed.',
  },
  {
    id: 'ig-inaccessible-404',
    name: 'Instagram Reel: Non-existent shortcode (404/Login wall)',
    category: 'inaccessible',
    platform: Platform.INSTAGRAM,
    url: 'https://www.instagram.com/reel/ZZZZZZZZZZZ/',
    expectedAccessLevel: 'inaccessible',
    description: 'Bogus Instagram reel shortcode that redirects to login or returns 404.',
  },
  {
    id: 'security-ssrf-blocked',
    name: 'Security Test: Loopback SSRF attack vector (127.0.0.1:27017)',
    category: 'inaccessible',
    platform: Platform.YOUTUBE,
    url: 'http://127.0.0.1:27017/shorts/exploit',
    expectedAccessLevel: 'inaccessible',
    description: 'Internal private IP attempt targeting local MongoDB port, blocked by SSRF guard.',
  },
];
