package fleet

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestTail(t *testing.T) {
	text := "one\ntwo\nthree\nfour\n"
	if got := Tail(text, 2, 100); got != "three\nfour" {
		t.Fatalf("got %q", got)
	}
	if got := Tail(text, 10, 4); got != "four" {
		t.Fatalf("got %q", got)
	}
}

func TestPullRequestBodyFencesLogs(t *testing.T) {
	body := PullRequestBody("0.1.30", "The upgrade's build step failed in `docs`.", "error\n```\nnested", "https://github.com/a/b/actions/runs/1")
	for _, want := range []string{"Upgrades zuedocs to 0.1.30.", "build step failed", "````text\nerror\n```\nnested\n````", "actions/runs/1"} {
		if !strings.Contains(body, want) {
			t.Errorf("body is missing %q:\n%s", want, body)
		}
	}
}

func TestMarkdownSummaryPutsProblemsFirst(t *testing.T) {
	results := []Result{
		{Repo: Repo{Owner: "o", Name: "alpha"}, Status: StatusUpdated, Sites: []string{"docs"}, From: "0.1.26"},
		{Repo: Repo{Owner: "o", Name: "beta"}, Status: StatusPullRequest, Detail: "build failed | badly", URL: "https://example.com/pr/1"},
	}
	out := MarkdownSummary("Rollout", results)
	if strings.Index(out, "beta") > strings.Index(out, "alpha") {
		t.Fatalf("pull requests should be listed first:\n%s", out)
	}
	for _, want := range []string{"1 pull-request, 1 updated", `build failed \| badly`, "[pull request](https://example.com/pr/1)", "from 0.1.26"} {
		if !strings.Contains(out, want) {
			t.Errorf("summary is missing %q:\n%s", want, out)
		}
	}
}

func TestDeployNote(t *testing.T) {
	root := writeFiles(t, map[string]string{".github/workflows/ci.yml": "on: push\njobs: {}\n"})
	if deployNote(root) == "" {
		t.Fatal("a repository without a deploy workflow should get a note")
	}
	if err := os.WriteFile(filepath.Join(root, ".github/workflows/docs.yml"), []byte("run: npx vercel deploy --prebuilt"), 0o644); err != nil {
		t.Fatal(err)
	}
	if deployNote(root) != "" {
		t.Fatal("a deploy workflow should clear the note")
	}
}

// Upgrade end to end with a fake package manager on PATH, so no network or
// real install happens.
func TestUpgradeRunsInstallCheckAndBuild(t *testing.T) {
	root := writeFiles(t, map[string]string{
		"docs/package.json": `{"scripts":{"check":"c","build":"b"},"dependencies":{"zuedocs":"0.1.26"}}`,
		"docs/bun.lock":     "{}",
	})
	bin := t.TempDir()
	calls := filepath.Join(bin, "calls")
	script := "#!/bin/sh\necho \"$PWD $*\" >> " + calls + "\n"
	if err := os.WriteFile(filepath.Join(bin, "bun"), []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("PATH", bin+string(os.PathListSeparator)+os.Getenv("PATH"))

	var log strings.Builder
	result, err := Upgrade(context.Background(), root, UpgradeOptions{Target: "0.1.30", Verify: true, Log: &log})
	if err != nil {
		t.Fatalf("%v\n%s", err, log.String())
	}
	if len(result.Changed) != 1 || result.From[0] != "0.1.26" {
		t.Fatalf("unexpected result %+v", result)
	}
	data, _ := os.ReadFile(calls)
	docs := filepath.Join(root, "docs")
	resolved, _ := filepath.EvalSymlinks(docs)
	got := strings.ReplaceAll(string(data), resolved, docs)
	want := docs + " install\n" + docs + " run check\n" + docs + " run build\n"
	if got != want {
		t.Fatalf("calls:\n%s\nwant:\n%s", got, want)
	}

	// Running again is a no-op.
	result, err = Upgrade(context.Background(), root, UpgradeOptions{Target: "0.1.30", Verify: true, Log: &log})
	if err != nil || len(result.Changed) != 0 {
		t.Fatalf("second run changed %d sites, err %v", len(result.Changed), err)
	}
}
