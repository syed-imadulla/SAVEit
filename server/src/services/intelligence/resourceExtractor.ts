import { ExtractedResource, ResourceType } from './types';

// Regex for extracting full URLs (http or https)
const URL_REGEX = /https?:\/\/[^\s<>"'{}|\\^`[\]()]+/gi;

// Regex for GitHub repo references: e.g. "github.com/owner/repo" or "owner/repo"
const GITHUB_URL_REGEX = /https?:\/\/github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/gi;
const GITHUB_SHORTHAND_REGEX = /\b(github(?::|\s+repo)?\s+([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+))\b/gi;

// Common tech keywords to recognize as technical tools
const KNOWN_TECH_TOOLS = new Set([
  'docker', 'kubernetes', 'k8s', 'git', 'github', 'gitlab', 'vite', 'webpack',
  'react', 'vue', 'svelte', 'angular', 'nextjs', 'next.js', 'remix',
  'tailwind', 'tailwindcss', 'postcss', 'typescript', 'javascript', 'python',
  'fastapi', 'flask', 'django', 'express', 'nestjs', 'node.js', 'nodejs',
  'mongodb', 'postgres', 'postgresql', 'mysql', 'sqlite', 'redis', 'prisma',
  'graphql', 'trpc', 'zod', 'vitest', 'jest', 'playwright', 'cypress',
  'linux', 'ubuntu', 'nginx', 'caddy', 'terraform', 'ansible', 'aws', 'gcp', 'azure'
]);

/**
 * Extracts candidate links and technical resources from raw text.
 */
export function extractCandidateResources(text: string): ExtractedResource[] {
  if (!text || typeof text !== 'string') {
    return [];
  }

  const resources: ExtractedResource[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  // 1. Extract explicit URLs
  const urls = text.match(URL_REGEX) || [];
  for (const rawUrl of urls) {
    // Strip trailing punctuation often caught in URLs (e.g., "https://foo.com.")
    const cleanUrl = rawUrl.replace(/[.,;:!?)]+$/, '');
    if (seenUrls.has(cleanUrl)) continue;
    seenUrls.add(cleanUrl);

    let type: ResourceType = 'website';
    let title = cleanUrl;

    if (cleanUrl.includes('github.com')) {
      type = 'github_repo';
      const match = cleanUrl.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
      if (match) {
        title = `${match[1]}/${match[2].replace(/\.git$/, '')}`;
      }
    } else if (cleanUrl.includes('docs.') || cleanUrl.includes('/docs')) {
      type = 'documentation';
      try {
        title = `${new URL(cleanUrl).hostname} Documentation`;
      } catch {
        title = cleanUrl;
      }
    } else {
      try {
        title = new URL(cleanUrl).hostname;
      } catch {
        title = cleanUrl;
      }
    }

    seenTitles.add(title.toLowerCase());
    resources.push({
      title,
      url: cleanUrl,
      type,
      status: 'unverified_mention', // Pending link verification in Plan 03-03
      description: `Discovered link in video text: ${cleanUrl}`,
    });
  }

  // 2. Extract GitHub shorthand mentions: e.g. "github owner/repo"
  let ghMatch: RegExpExecArray | null;
  while ((ghMatch = GITHUB_SHORTHAND_REGEX.exec(text)) !== null) {
    const owner = ghMatch[2];
    const repo = ghMatch[3];
    const repoTitle = `${owner}/${repo}`;
    if (!seenTitles.has(repoTitle.toLowerCase())) {
      seenTitles.add(repoTitle.toLowerCase());
      const candidateUrl = `https://github.com/${owner}/${repo}`;
      if (!seenUrls.has(candidateUrl)) {
        seenUrls.add(candidateUrl);
        resources.push({
          title: repoTitle,
          url: candidateUrl,
          type: 'github_repo',
          status: 'unverified_mention',
          description: `GitHub repository mentioned: ${repoTitle}`,
        });
      }
    }
  }

  // 3. Extract mentions of well-known software tools and frameworks
  const words = text.toLowerCase().match(/\b[a-z0-9_.-]+\b/g) || [];
  for (const word of words) {
    if (KNOWN_TECH_TOOLS.has(word) && !seenTitles.has(word)) {
      seenTitles.add(word);
      const title = word.charAt(0).toUpperCase() + word.slice(1);
      resources.push({
        title,
        type: 'tool',
        status: 'unverified_mention',
        description: `Technical tool mentioned in video: ${title}`,
      });
    }
  }

  return resources;
}

/**
 * Merges and deduplicates resources extracted by the LLM and the heuristic regex extractor.
 */
export function mergeResources(
  llmResources: ExtractedResource[] = [],
  heuristicResources: ExtractedResource[] = []
): ExtractedResource[] {
  const merged: ExtractedResource[] = [...llmResources];
  const seenTitles = new Set(llmResources.map((r) => r.title.toLowerCase().trim()));
  const seenUrls = new Set(
    llmResources.map((r) => r.url?.toLowerCase().trim()).filter(Boolean) as string[]
  );

  for (const hr of heuristicResources) {
    const normTitle = hr.title.toLowerCase().trim();
    const normUrl = hr.url?.toLowerCase().trim();

    if (seenTitles.has(normTitle) || (normUrl && seenUrls.has(normUrl))) {
      continue;
    }

    seenTitles.add(normTitle);
    if (normUrl) seenUrls.add(normUrl);
    merged.push(hr);
  }

  return merged;
}
