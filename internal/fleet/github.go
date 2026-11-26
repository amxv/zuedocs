package fleet

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"
)

// Topic marks a GitHub repository as a zuedocs consumer.
const Topic = "zuedocs"

// Repo is a GitHub repository that may hold zuedocs sites.
type Repo struct {
	Owner         string
	Name          string
	DefaultBranch string
	Private       bool
	Archived      bool
	Topics        []string
}

// FullName is "owner/name".
func (r Repo) FullName() string { return r.Owner + "/" + r.Name }

// GitHub is a small REST client for the endpoints the fleet needs.
type GitHub struct {
	Token   string
	BaseURL string
	Client  *http.Client
}

// NewGitHub uses GH_TOKEN, GITHUB_TOKEN, or ZUEDOCS_FLEET_TOKEN, and falls
// back to the GitHub CLI's login for local runs.
func NewGitHub() (*GitHub, error) {
	token := ""
	for _, name := range []string{"ZUEDOCS_FLEET_TOKEN", "GH_TOKEN", "GITHUB_TOKEN"} {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			token = value
			break
		}
	}
	if token == "" {
		out, err := exec.Command("gh", "auth", "token").Output()
		if err == nil {
			token = strings.TrimSpace(string(out))
		}
	}
	if token == "" {
		return nil, errors.New("no GitHub token: set ZUEDOCS_FLEET_TOKEN or GH_TOKEN, or run `gh auth login`")
	}
	return &GitHub{Token: token, BaseURL: "https://api.github.com", Client: &http.Client{Timeout: 60 * time.Second}}, nil
}

type apiError struct {
	Status int
	Body   string
}

func (e *apiError) Error() string {
	return fmt.Sprintf("GitHub API %d: %s", e.Status, strings.TrimSpace(e.Body))
}

func (g *GitHub) do(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(data)
	}
	target := path
	if !strings.HasPrefix(path, "http") {
		target = g.BaseURL + path
	}
	req, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Authorization", "Bearer "+g.Token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("User-Agent", "zuedocs-fleet")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := g.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}
	if resp.StatusCode >= 300 {
		return &apiError{Status: resp.StatusCode, Body: string(data)}
	}
	if out != nil && len(data) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

type apiRepo struct {
	Name          string   `json:"name"`
	DefaultBranch string   `json:"default_branch"`
	Private       bool     `json:"private"`
	Archived      bool     `json:"archived"`
	Topics        []string `json:"topics"`
	Owner         struct {
		Login string `json:"login"`
	} `json:"owner"`
}

func (r apiRepo) repo() Repo {
	return Repo{Owner: r.Owner.Login, Name: r.Name, DefaultBranch: r.DefaultBranch, Private: r.Private, Archived: r.Archived, Topics: r.Topics}
}

// AccessibleRepos lists every repository the token can see. GitHub App
// installation tokens list the installation's repositories; personal tokens
// list the user's own and organization repositories.
func (g *GitHub) AccessibleRepos(ctx context.Context) ([]Repo, error) {
	var repos []Repo
	installation := strings.HasPrefix(g.Token, "ghs_")
	for page := 1; ; page++ {
		var batch []apiRepo
		if installation {
			var response struct {
				Repositories []apiRepo `json:"repositories"`
			}
			if err := g.do(ctx, http.MethodGet, fmt.Sprintf("/installation/repositories?per_page=100&page=%d", page), nil, &response); err != nil {
				return nil, err
			}
			batch = response.Repositories
		} else {
			path := fmt.Sprintf("/user/repos?affiliation=owner,organization_member&per_page=100&page=%d", page)
			if err := g.do(ctx, http.MethodGet, path, nil, &batch); err != nil {
				return nil, err
			}
		}
		for _, item := range batch {
			repos = append(repos, item.repo())
		}
		if len(batch) < 100 {
			return repos, nil
		}
	}
}

// Consumers returns the owner's unarchived repositories tagged with Topic.
func (g *GitHub) Consumers(ctx context.Context, owner string) ([]Repo, error) {
	all, err := g.AccessibleRepos(ctx)
	if err != nil {
		return nil, err
	}
	var repos []Repo
	for _, repo := range all {
		if !strings.EqualFold(repo.Owner, owner) || repo.Archived || !HasTopic(repo.Topics, Topic) {
			continue
		}
		repos = append(repos, repo)
	}
	sort.Slice(repos, func(i, j int) bool { return repos[i].Name < repos[j].Name })
	return repos, nil
}

func HasTopic(topics []string, topic string) bool {
	for _, item := range topics {
		if item == topic {
			return true
		}
	}
	return false
}

// GetRepo fetches one repository.
func (g *GitHub) GetRepo(ctx context.Context, fullName string) (Repo, error) {
	var item apiRepo
	if err := g.do(ctx, http.MethodGet, "/repos/"+fullName, nil, &item); err != nil {
		return Repo{}, err
	}
	return item.repo(), nil
}

// AddTopic adds Topic to a repository, keeping its other topics.
func (g *GitHub) AddTopic(ctx context.Context, repo Repo) (bool, error) {
	var current struct {
		Names []string `json:"names"`
	}
	if err := g.do(ctx, http.MethodGet, "/repos/"+repo.FullName()+"/topics", nil, &current); err != nil {
		return false, err
	}
	if HasTopic(current.Names, Topic) {
		return false, nil
	}
	names := append(current.Names, Topic)
	return true, g.do(ctx, http.MethodPut, "/repos/"+repo.FullName()+"/topics", map[string]any{"names": names}, nil)
}

// PullRequest is the subset of a GitHub pull request the fleet uses.
type PullRequest struct {
	Number  int    `json:"number"`
	HTMLURL string `json:"html_url"`
	Head    struct {
		Ref string `json:"ref"`
	} `json:"head"`
}

// OpenUpgradePRs lists open pull requests from zuedocs upgrade branches.
func (g *GitHub) OpenUpgradePRs(ctx context.Context, repo Repo) ([]PullRequest, error) {
	var prs []PullRequest
	if err := g.do(ctx, http.MethodGet, "/repos/"+repo.FullName()+"/pulls?state=open&per_page=100", nil, &prs); err != nil {
		return nil, err
	}
	var upgrades []PullRequest
	for _, pr := range prs {
		if strings.HasPrefix(pr.Head.Ref, UpgradeBranchPrefix) {
			upgrades = append(upgrades, pr)
		}
	}
	return upgrades, nil
}

// CreatePR opens a pull request.
func (g *GitHub) CreatePR(ctx context.Context, repo Repo, head, title, body string) (PullRequest, error) {
	var pr PullRequest
	err := g.do(ctx, http.MethodPost, "/repos/"+repo.FullName()+"/pulls", map[string]any{
		"title": title, "head": head, "base": repo.DefaultBranch, "body": body,
	}, &pr)
	return pr, err
}

// UpdatePRBody replaces a pull request's description.
func (g *GitHub) UpdatePRBody(ctx context.Context, repo Repo, number int, body string) error {
	return g.do(ctx, http.MethodPatch, fmt.Sprintf("/repos/%s/pulls/%d", repo.FullName(), number), map[string]any{"body": body}, nil)
}

// ClosePR comments on, closes, and deletes the branch of a pull request.
func (g *GitHub) ClosePR(ctx context.Context, repo Repo, pr PullRequest, comment string) error {
	if comment != "" {
		if err := g.do(ctx, http.MethodPost, fmt.Sprintf("/repos/%s/issues/%d/comments", repo.FullName(), pr.Number), map[string]any{"body": comment}, nil); err != nil {
			return err
		}
	}
	if err := g.do(ctx, http.MethodPatch, fmt.Sprintf("/repos/%s/pulls/%d", repo.FullName(), pr.Number), map[string]any{"state": "closed"}, nil); err != nil {
		return err
	}
	err := g.do(ctx, http.MethodDelete, fmt.Sprintf("/repos/%s/git/refs/heads/%s", repo.FullName(), pr.Head.Ref), nil, nil)
	var apiErr *apiError
	if errors.As(err, &apiErr) && (apiErr.Status == http.StatusNotFound || apiErr.Status == http.StatusUnprocessableEntity) {
		return nil
	}
	return err
}

func asAPIError(err error, target **apiError) bool { return errors.As(err, target) }
