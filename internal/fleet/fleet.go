package fleet

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// UpgradeBranchPrefix names the branches upgrade pull requests come from.
const UpgradeBranchPrefix = "zuedocs/upgrade-"

// Status is the outcome for one repository.
type Status string

const (
	StatusUpdated      Status = "updated"       // pushed to the default branch
	StatusWouldUpdate  Status = "would-update"  // dry run of an update
	StatusCurrent      Status = "current"       // already on the version
	StatusPullRequest  Status = "pull-request"  // needs review, opened or updated a PR
	StatusNoSite       Status = "no-site"       // tagged but no package depends on zuedocs
	StatusFailed       Status = "failed"        // could not finish, see the log
	StatusPass         Status = "pass"          // smoke build passed
	StatusRegression   Status = "regression"    // smoke build fails only on the new package
	StatusBrokenBefore Status = "broken-before" // smoke build already fails on the current version
)

// NeedsAttention reports whether a status should fail the command.
func (s Status) NeedsAttention() bool {
	return s == StatusPullRequest || s == StatusFailed || s == StatusRegression
}

// Result is what happened to one repository.
type Result struct {
	Repo   Repo
	Status Status
	Sites  []string // site directories
	From   string   // previous zuedocs spec, when one changed
	Detail string
	URL    string // pull request URL
	Note   string
	Log    string // path to the full log
}

// Runner fans a fleet operation out over consumer repositories.
type Runner struct {
	GitHub  *GitHub
	Workdir string
	Jobs    int
	DryRun  bool
	Out     io.Writer

	mu sync.Mutex
}

func (r *Runner) printf(format string, args ...any) {
	r.mu.Lock()
	defer r.mu.Unlock()
	fmt.Fprintf(r.Out, format, args...)
}

func (r *Runner) each(ctx context.Context, repos []Repo, work func(context.Context, Repo, io.Writer, string) Result) []Result {
	results := make([]Result, len(repos))
	jobs := r.Jobs
	if jobs < 1 {
		jobs = 1
	}
	slots := make(chan struct{}, jobs)
	var wg sync.WaitGroup
	for index, repo := range repos {
		wg.Add(1)
		go func() {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()

			logPath := filepath.Join(r.Workdir, "logs", repo.Name+".log")
			_ = os.MkdirAll(filepath.Dir(logPath), 0o755)
			file, err := os.Create(logPath)
			if err != nil {
				results[index] = Result{Repo: repo, Status: StatusFailed, Detail: err.Error()}
				return
			}
			defer file.Close()

			started := time.Now()
			result := work(ctx, repo, file, filepath.Join(r.Workdir, "repos", repo.Name))
			result.Repo = repo
			result.Log = logPath
			results[index] = result
			r.printf("%-24s %-14s %s (%s)\n", repo.Name, result.Status, oneLine(result), time.Since(started).Round(time.Second))
		}()
	}
	wg.Wait()
	return results
}

func oneLine(result Result) string {
	parts := []string{}
	if result.Detail != "" {
		parts = append(parts, result.Detail)
	}
	if result.URL != "" {
		parts = append(parts, result.URL)
	}
	if result.Note != "" {
		parts = append(parts, result.Note)
	}
	return strings.Join(parts, "; ")
}

// Rollout upgrades every repository to version. Repositories that pass their
// docs checks and build get a commit on the default branch, which their own
// deploy workflows ship. The rest get a pull request with the failure log.
func (r *Runner) Rollout(ctx context.Context, repos []Repo, version string) []Result {
	git := Git{Token: r.GitHub.Token}
	return r.each(ctx, repos, func(ctx context.Context, repo Repo, log io.Writer, dir string) Result {
		git := git
		git.Log = log
		if err := git.Clone(ctx, repo, dir); err != nil {
			return Result{Status: StatusFailed, Detail: err.Error()}
		}
		upgrade, err := Upgrade(ctx, dir, UpgradeOptions{Target: version, Verify: true, Log: log})
		result := Result{Sites: siteDirs(upgrade.Sites), From: strings.Join(unique(upgrade.From), ", "), Note: deployNote(dir)}
		if len(upgrade.Sites) == 0 && err == nil {
			result.Status = StatusNoSite
			return result
		}
		var step *StepError
		if err != nil && (!errors.As(err, &step) || step.Step == "edit") {
			result.Status, result.Detail = StatusFailed, err.Error()
			return result
		}
		if err == nil && len(upgrade.Changed) == 0 {
			result.Status = StatusCurrent
			result.Note = ""
			r.closeUpgradePRs(ctx, repo, "", fmt.Sprintf("This repository is already on zuedocs %s.", version))
			return result
		}

		message := fmt.Sprintf("chore(docs): bump zuedocs to %s", version)
		if _, commitErr := git.Commit(ctx, dir, ChangedFiles(dir, upgrade.Changed), message); commitErr != nil {
			result.Status, result.Detail = StatusFailed, "commit: "+commitErr.Error()
			return result
		}

		reason := ""
		if err != nil {
			reason = fmt.Sprintf("The upgrade's %s step failed in `%s`.", step.Step, step.Dir)
			result.Detail = err.Error()
		} else {
			if r.DryRun {
				result.Status = StatusWouldUpdate
				return result
			}
			pushErr := git.PushToBranch(ctx, dir, repo.DefaultBranch)
			if pushErr == nil {
				result.Status = StatusUpdated
				r.closeUpgradePRs(ctx, repo, "", fmt.Sprintf("Superseded: zuedocs %s was pushed to `%s`.", version, repo.DefaultBranch))
				return result
			}
			reason = fmt.Sprintf("Checks and build passed, but pushing to `%s` failed (%v).", repo.DefaultBranch, pushErr)
			result.Detail = "push rejected"
		}

		result.Status = StatusPullRequest
		if r.DryRun {
			result.Detail = "would open a pull request: " + result.Detail
			return result
		}
		url, prErr := r.openUpgradePR(ctx, git, repo, dir, version, reason, tailLog(log))
		if prErr != nil {
			result.Status, result.Detail = StatusFailed, result.Detail+"; pull request: "+prErr.Error()
			return result
		}
		result.URL = url
		return result
	})
}

func (r *Runner) openUpgradePR(ctx context.Context, git Git, repo Repo, dir, version, reason, logTail string) (string, error) {
	branch := UpgradeBranchPrefix + version
	if err := git.ForcePush(ctx, dir, branch); err != nil {
		return "", err
	}
	body := PullRequestBody(version, reason, logTail, RunURL())
	open, err := r.GitHub.OpenUpgradePRs(ctx, repo)
	if err != nil {
		return "", err
	}
	r.closeUpgradePRs(ctx, repo, branch, fmt.Sprintf("Superseded by the zuedocs %s upgrade.", version))
	for _, pr := range open {
		if pr.Head.Ref == branch {
			return pr.HTMLURL, r.GitHub.UpdatePRBody(ctx, repo, pr.Number, body)
		}
	}
	pr, err := r.GitHub.CreatePR(ctx, repo, branch, "Bump zuedocs to "+version, body)
	return pr.HTMLURL, err
}

// closeUpgradePRs closes open upgrade pull requests except the one from keep.
func (r *Runner) closeUpgradePRs(ctx context.Context, repo Repo, keep, comment string) {
	if r.DryRun {
		return
	}
	open, err := r.GitHub.OpenUpgradePRs(ctx, repo)
	if err != nil {
		return
	}
	for _, pr := range open {
		if pr.Head.Ref != keep {
			_ = r.GitHub.ClosePR(ctx, repo, pr, comment)
		}
	}
}

// Smoke builds every repository against a packed zuedocs tarball. A failure
// counts as a regression only when the same repository still builds with the
// version it already uses.
func (r *Runner) Smoke(ctx context.Context, repos []Repo, tarball string) []Result {
	git := Git{Token: r.GitHub.Token}
	return r.each(ctx, repos, func(ctx context.Context, repo Repo, log io.Writer, dir string) Result {
		git := git
		git.Log = log
		if err := git.Clone(ctx, repo, dir); err != nil {
			return Result{Status: StatusFailed, Detail: err.Error()}
		}
		upgrade, err := Upgrade(ctx, dir, UpgradeOptions{Target: "file:" + tarball, Verify: true, Log: log})
		result := Result{Sites: siteDirs(upgrade.Sites)}
		if len(upgrade.Sites) == 0 && err == nil {
			result.Status = StatusNoSite
			return result
		}
		if err == nil {
			result.Status = StatusPass
			return result
		}

		fmt.Fprintf(log, "\n==> The new package failed (%v). Building with the current version to compare.\n", err)
		baseline := dir + "-baseline"
		if cloneErr := git.Clone(ctx, repo, baseline); cloneErr != nil {
			result.Status, result.Detail = StatusFailed, err.Error()+"; baseline: "+cloneErr.Error()
			return result
		}
		sites, findErr := FindSites(baseline)
		baseErr := findErr
		if baseErr == nil {
			baseErr = InstallAndVerify(ctx, baseline, sites, true, log)
		}
		if baseErr != nil {
			result.Status, result.Detail = StatusBrokenBefore, baseErr.Error()
			return result
		}
		result.Status, result.Detail = StatusRegression, err.Error()
		return result
	})
}

func siteDirs(sites []Site) []string {
	var dirs []string
	for _, site := range sites {
		dirs = append(dirs, site.RelDir)
	}
	return dirs
}

func unique(values []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, value := range values {
		if !seen[value] {
			seen[value] = true
			out = append(out, value)
		}
	}
	return out
}

// deployNote flags repositories with no workflow that looks like it deploys,
// since a pushed upgrade will not go live there on its own.
func deployNote(dir string) string {
	entries, _ := os.ReadDir(filepath.Join(dir, ".github", "workflows"))
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".yml") && !strings.HasSuffix(name, ".yaml") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, ".github", "workflows", name))
		if err != nil {
			continue
		}
		text := strings.ToLower(string(data))
		if strings.Contains(text, "deploy") || strings.Contains(text, "wrangler") {
			return ""
		}
	}
	return "no deploy workflow, deploy by hand"
}

// tailLog returns the end of a log file, for pull request bodies.
func tailLog(log io.Writer) string {
	file, ok := log.(*os.File)
	if !ok {
		return ""
	}
	data, err := os.ReadFile(file.Name())
	if err != nil {
		return ""
	}
	return Tail(string(data), 120, 50000)
}

// Tail keeps the last lines of text, within a byte budget.
func Tail(text string, lines, maxBytes int) string {
	text = strings.TrimRight(text, "\n")
	parts := strings.Split(text, "\n")
	if len(parts) > lines {
		parts = parts[len(parts)-lines:]
	}
	out := strings.Join(parts, "\n")
	if len(out) > maxBytes {
		out = out[len(out)-maxBytes:]
	}
	return out
}

// RunURL links to the current GitHub Actions run, when there is one.
func RunURL() string {
	server, repository, run := os.Getenv("GITHUB_SERVER_URL"), os.Getenv("GITHUB_REPOSITORY"), os.Getenv("GITHUB_RUN_ID")
	if server == "" || repository == "" || run == "" {
		return ""
	}
	return fmt.Sprintf("%s/%s/actions/runs/%s", server, repository, run)
}

// PullRequestBody explains why an upgrade needs review.
func PullRequestBody(version, reason, logTail, runURL string) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Upgrades zuedocs to %s.\n\n%s It was opened as a pull request instead of being pushed straight to the default branch.\n", version, reason)
	if logTail != "" {
		fence := "```"
		for strings.Contains(logTail, fence) {
			fence += "`"
		}
		fmt.Fprintf(&b, "\n<details><summary>End of the upgrade log</summary>\n\n%stext\n%s\n%s\n\n</details>\n", fence, logTail, fence)
	}
	b.WriteString("\nTo retry after a fix, run `zuedocs-fleet upgrade` in this repository or run the zuedocs `fleet` workflow again.")
	if runURL != "" {
		fmt.Fprintf(&b, " Opened by [zuedocs-fleet](%s).", runURL)
	}
	b.WriteString("\n")
	return b.String()
}
