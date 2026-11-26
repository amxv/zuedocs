package fleet

import (
	"bytes"
	"context"
	"encoding/base64"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Git runs git with GitHub credentials passed through the environment, so
// the token never lands in a clone's .git/config or in process arguments.
type Git struct {
	Token string
	Log   io.Writer
}

func (g Git) env() []string {
	auth := base64.StdEncoding.EncodeToString([]byte("x-access-token:" + g.Token))
	return append(scrubbedEnv(),
		"GIT_TERMINAL_PROMPT=0",
		"GIT_CONFIG_COUNT=1",
		"GIT_CONFIG_KEY_0=http.https://github.com/.extraheader",
		"GIT_CONFIG_VALUE_0=AUTHORIZATION: basic "+auth,
	)
}

// Run runs git in dir and returns trimmed stdout. Output also goes to the log.
func (g Git) Run(ctx context.Context, dir string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Minute)
	defer cancel()
	fmt.Fprintf(g.Log, "\n$ git %s\n", strings.Join(args, " "))
	var stdout bytes.Buffer
	cmd := exec.CommandContext(ctx, "git", args...)
	cmd.Dir = dir
	cmd.Env = g.env()
	cmd.Stdout = io.MultiWriter(&stdout, g.Log)
	cmd.Stderr = g.Log
	err := cmd.Run()
	return strings.TrimSpace(stdout.String()), err
}

// Clone makes a shallow clone of the repository's default branch, retrying
// transient network failures.
func (g Git) Clone(ctx context.Context, repo Repo, dir string) error {
	url := "https://github.com/" + repo.FullName() + ".git"
	var err error
	for attempt := 1; attempt <= 3; attempt++ {
		_ = os.RemoveAll(dir)
		_, err = g.Run(ctx, "", "clone", "--quiet", "--depth", "20", "--branch", repo.DefaultBranch, url, dir)
		if err == nil {
			return nil
		}
		time.Sleep(time.Duration(attempt) * 3 * time.Second)
	}
	return fmt.Errorf("clone %s: %w", repo.FullName(), err)
}

// Commit stages exactly the given files and commits them. It returns false
// when none of them changed.
func (g Git) Commit(ctx context.Context, dir string, files []string, message string) (bool, error) {
	var existing []string
	for _, file := range files {
		if _, err := os.Stat(dir + "/" + file); err == nil {
			existing = append(existing, file)
		}
	}
	if len(existing) == 0 {
		return false, nil
	}
	if _, err := g.Run(ctx, dir, append([]string{"add", "--"}, existing...)...); err != nil {
		return false, err
	}
	if _, err := g.Run(ctx, dir, "diff", "--cached", "--quiet"); err == nil {
		return false, nil
	}
	_, err := g.Run(ctx, dir, "commit", "--quiet", "-m", message)
	return err == nil, err
}

// PushToBranch pushes HEAD to the default branch. If the branch moved since
// the clone, it rebases once and tries again.
func (g Git) PushToBranch(ctx context.Context, dir, branch string) error {
	if _, err := g.Run(ctx, dir, "push", "--quiet", "origin", "HEAD:refs/heads/"+branch); err == nil {
		return nil
	}
	if _, err := g.Run(ctx, dir, "pull", "--quiet", "--rebase", "origin", branch); err != nil {
		_, _ = g.Run(ctx, dir, "rebase", "--abort")
		return fmt.Errorf("push to %s was rejected and rebasing failed: %w", branch, err)
	}
	if _, err := g.Run(ctx, dir, "push", "--quiet", "origin", "HEAD:refs/heads/"+branch); err != nil {
		return fmt.Errorf("push to %s was rejected: %w", branch, err)
	}
	return nil
}

// ForcePush replaces a branch with HEAD.
func (g Git) ForcePush(ctx context.Context, dir, branch string) error {
	_, err := g.Run(ctx, dir, "push", "--quiet", "--force", "origin", "HEAD:refs/heads/"+branch)
	return err
}
