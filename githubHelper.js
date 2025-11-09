// githubHelper.js
import { Octokit } from "octokit";
import stringSimilarity from "string-similarity";

/**
 * Initialize Octokit client using the GitHub token.
 */
export function createGitHubClient() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GitHub token not set in environment variables");
  return new Octokit({ auth: token });
}

/**
 * Fetch all repos the user can access.
 */
export async function getUserRepos(octokit) {
  const response = await octokit.request("GET /user/repos", {
    per_page: 100,
    affiliation: "owner,collaborator,organization_member"
  });
  return response.data.map(repo => repo.full_name); // e.g. "username/repo"
}

/**
 * Find the repo that best matches the user's natural-language query.
 */
export function findBestMatchingRepo(query, repoNames) {
  if (repoNames.length === 0) return null;

  const match = stringSimilarity.findBestMatch(query, repoNames);
  const best = match.bestMatch;
  if (best.rating < 0.2) return null; // not confident enough
  return best.target;
}

/**
 * Fetch open pull requests for the selected repo.
 */
export async function getOpenPullRequests(octokit, fullRepoName) {
  const [owner, repo] = fullRepoName.split("/");
  const response = await octokit.request("GET /repos/{owner}/{repo}/pulls", {
    owner,
    repo,
    state: "open"
  });

  if (response.data.length === 0) {
    return `No open pull requests in ${fullRepoName}.`;
  }

  const prList = response.data.map(pr => `• ${pr.title} (#${pr.number})`).join("\n");
  return `Open pull requests for **${fullRepoName}**:\n${prList}`;
}

/**
 * High-level function to process a query and return results.
 */
export async function handleGitHubQuery(query) {
  const octokit = createGitHubClient();

  const repos = await getUserRepos(octokit);
  const bestRepo = findBestMatchingRepo(query, repos);

  if (!bestRepo) {
    return "I couldn’t determine which repository you meant. Please specify the repo name.";
  }

  return await getOpenPullRequests(octokit, bestRepo);
}
