// Command zuedocs-fleet keeps every zuedocs docs site on the latest package.
//
// Consumer repositories are found by the "zuedocs" GitHub topic. See the
// "Upgrading consumer sites" section of the zuedocs README.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/amxv/zuedocs/internal/fleet"
)

const usage = `zuedocs-fleet keeps zuedocs docs sites up to date.

Usage:
  zuedocs-fleet upgrade [dir]   Upgrade the sites in a local checkout, then check and build them
  zuedocs-fleet list            List consumer repositories (tagged with the "zuedocs" topic)
  zuedocs-fleet adopt [repo...] Tag repositories as consumers; with no names, list untagged dependents
  zuedocs-fleet rollout         Upgrade every consumer: push passing builds, open pull requests for the rest
  zuedocs-fleet smoke           Build every consumer against a packed zuedocs tarball, without pushing

Run "zuedocs-fleet <command> -h" for a command's flags.

GitHub access comes from ZUEDOCS_FLEET_TOKEN, GH_TOKEN, or GITHUB_TOKEN, or
from "gh auth token" when none is set.
`

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if len(os.Args) < 2 {
		fmt.Fprint(os.Stderr, usage)
		os.Exit(2)
	}
	var err error
	switch os.Args[1] {
	case "upgrade":
		err = runUpgrade(ctx, os.Args[2:])
	case "list":
		err = runList(ctx, os.Args[2:])
	case "adopt":
		err = runAdopt(ctx, os.Args[2:])
	case "rollout":
		err = runRollout(ctx, os.Args[2:])
	case "smoke":
		err = runSmoke(ctx, os.Args[2:])
	case "-h", "--help", "help":
		fmt.Print(usage)
		return
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n%s", os.Args[1], usage)
		os.Exit(2)
	}

	var attention needsAttention
	switch {
	case errors.As(err, &attention):
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	case errors.Is(err, flag.ErrHelp):
		os.Exit(0)
	case err != nil:
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}

type needsAttention string

func (n needsAttention) Error() string { return string(n) }

func defaultOwner() string {
	if owner := os.Getenv("GITHUB_REPOSITORY_OWNER"); owner != "" {
		return owner
	}
	return "amxv"
}

func runUpgrade(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("upgrade", flag.ContinueOnError)
	version := flags.String("version", "latest", "zuedocs version to install")
	tarball := flags.String("tarball", "", "install this packed zuedocs tarball instead of a published version")
	noVerify := flags.Bool("no-verify", false, "only update package.json and the lockfile, skip check and build")
	if err := flags.Parse(reorder(args)); err != nil {
		return err
	}
	dir := "."
	if flags.NArg() > 0 {
		dir = flags.Arg(0)
	}
	root, err := repoRoot(dir)
	if err != nil {
		return err
	}

	target := ""
	if *tarball != "" {
		abs, err := filepath.Abs(*tarball)
		if err != nil {
			return err
		}
		target = "file:" + abs
	} else if target, err = fleet.ResolveVersion(ctx, *version); err != nil {
		return err
	}

	result, err := fleet.Upgrade(ctx, root, fleet.UpgradeOptions{Target: target, Verify: !*noVerify, Log: os.Stdout})
	if len(result.Sites) == 0 && err == nil {
		return fmt.Errorf("no package.json under %s depends on zuedocs", root)
	}
	if err != nil {
		return err
	}
	if len(result.Changed) == 0 {
		fmt.Printf("Already on zuedocs %s.\n", target)
		return nil
	}
	fmt.Printf("\nUpgraded %d site(s) to zuedocs %s. Review and commit:\n", len(result.Changed), target)
	for _, file := range fleet.ChangedFiles(root, result.Changed) {
		fmt.Println("  " + file)
	}
	return nil
}

// repoRoot is the Git top level containing dir, or dir itself outside Git.
func repoRoot(dir string) (string, error) {
	out, err := exec.Command("git", "-C", dir, "rev-parse", "--show-toplevel").Output()
	if err == nil {
		return strings.TrimSpace(string(out)), nil
	}
	return filepath.Abs(dir)
}

func runList(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("list", flag.ContinueOnError)
	owner := flags.String("owner", defaultOwner(), "GitHub owner of the consumer repositories")
	if err := flags.Parse(args); err != nil {
		return err
	}
	github, err := fleet.NewGitHub()
	if err != nil {
		return err
	}
	repos, err := github.Consumers(ctx, *owner)
	if err != nil {
		return err
	}
	for _, repo := range repos {
		visibility := "public"
		if repo.Private {
			visibility = "private"
		}
		fmt.Printf("%-40s %-8s %s\n", repo.FullName(), visibility, repo.DefaultBranch)
	}
	fmt.Fprintf(os.Stderr, "%d consumer repositories\n", len(repos))
	return nil
}

func runAdopt(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("adopt", flag.ContinueOnError)
	owner := flags.String("owner", defaultOwner(), "GitHub owner to scan, and for bare repository names")
	dryRun := flags.Bool("dry-run", false, "show what would be tagged")
	if err := flags.Parse(reorder(args)); err != nil {
		return err
	}
	github, err := fleet.NewGitHub()
	if err != nil {
		return err
	}
	names := flags.Args()
	if len(names) == 0 {
		// Without names, only report. Some dependents (forks, stale copies)
		// should never receive upgrades, so tagging stays a deliberate step.
		fmt.Fprintf(os.Stderr, "Scanning %s's repositories for a package.json that depends on zuedocs...\n", *owner)
		found, err := github.FindDependents(ctx, *owner)
		if err != nil {
			return err
		}
		untagged := 0
		for _, repo := range found {
			state := "tagged"
			if !fleet.HasTopic(repo.Topics, fleet.Topic) {
				state = "untagged"
				untagged++
			}
			fmt.Printf("%-9s %s\n", state, repo.FullName())
		}
		fmt.Fprintf(os.Stderr, "%d dependents, %d untagged. Tag one with `zuedocs-fleet adopt <repo>`.\n", len(found), untagged)
		return nil
	}
	for _, name := range names {
		if !strings.Contains(name, "/") {
			name = *owner + "/" + name
		}
		repo, err := github.GetRepo(ctx, name)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		if *dryRun {
			fmt.Printf("would tag %s\n", repo.FullName())
			continue
		}
		added, err := github.AddTopic(ctx, repo)
		if err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
		if added {
			fmt.Printf("tagged %s\n", repo.FullName())
		} else {
			fmt.Printf("already tagged %s\n", repo.FullName())
		}
	}
	return nil
}

type fleetFlags struct {
	owner   *string
	only    *string
	jobs    *int
	workdir *string
	keep    *bool
}

func addFleetFlags(flags *flag.FlagSet) fleetFlags {
	return fleetFlags{
		owner:   flags.String("owner", defaultOwner(), "GitHub owner of the consumer repositories"),
		only:    flags.String("only", "", "comma-separated repository names to limit the run to"),
		jobs:    flags.Int("jobs", 3, "repositories to work on at once"),
		workdir: flags.String("workdir", "", "directory for clones and logs (default: a new temporary directory)"),
		keep:    flags.Bool("keep", false, "keep clones after the run (logs are always kept)"),
	}
}

func (f fleetFlags) setup(ctx context.Context) (*fleet.Runner, []fleet.Repo, func(), error) {
	github, err := fleet.NewGitHub()
	if err != nil {
		return nil, nil, nil, err
	}
	repos, err := github.Consumers(ctx, *f.owner)
	if err != nil {
		return nil, nil, nil, err
	}
	if *f.only != "" {
		wanted := map[string]bool{}
		for _, name := range strings.Split(*f.only, ",") {
			wanted[strings.TrimSpace(name)] = true
		}
		var filtered []fleet.Repo
		for _, repo := range repos {
			if wanted[repo.Name] || wanted[repo.FullName()] {
				filtered = append(filtered, repo)
				delete(wanted, repo.Name)
				delete(wanted, repo.FullName())
			}
		}
		for name := range wanted {
			return nil, nil, nil, fmt.Errorf("%s is not a tagged consumer of %s (run `zuedocs-fleet adopt %s`)", name, *f.owner, name)
		}
		repos = filtered
	}
	if len(repos) == 0 {
		return nil, nil, nil, fmt.Errorf("no repositories owned by %s have the %q topic", *f.owner, fleet.Topic)
	}

	workdir := *f.workdir
	if workdir == "" {
		if workdir, err = os.MkdirTemp("", "zuedocs-fleet-"); err != nil {
			return nil, nil, nil, err
		}
	}
	if workdir, err = filepath.Abs(workdir); err != nil {
		return nil, nil, nil, err
	}
	cleanup := func() {
		if !*f.keep {
			_ = os.RemoveAll(filepath.Join(workdir, "repos"))
		}
		fmt.Printf("\nLogs: %s\n", filepath.Join(workdir, "logs"))
	}
	runner := &fleet.Runner{GitHub: github, Workdir: workdir, Jobs: *f.jobs, Out: os.Stdout}
	return runner, repos, cleanup, nil
}

func runRollout(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("rollout", flag.ContinueOnError)
	common := addFleetFlags(flags)
	version := flags.String("version", "latest", "zuedocs version to roll out")
	dryRun := flags.Bool("dry-run", false, "upgrade, check, and build, but do not push or open pull requests")
	wait := flags.Duration("wait", 10*time.Minute, "how long to wait for the version to appear on npm")
	if err := flags.Parse(args); err != nil {
		return err
	}
	resolved, err := fleet.ResolveVersion(ctx, *version)
	if err != nil {
		return err
	}
	if err := fleet.WaitForVersion(ctx, resolved, *wait, func(line string) { fmt.Println(line) }); err != nil {
		return err
	}
	runner, repos, cleanup, err := common.setup(ctx)
	if err != nil {
		return err
	}
	defer cleanup()
	runner.DryRun = *dryRun

	mode := ""
	if *dryRun {
		mode = " (dry run)"
	}
	fmt.Printf("Rolling out zuedocs %s to %d repositories%s\n\n", resolved, len(repos), mode)
	results := runner.Rollout(ctx, repos, resolved)
	return finish(fmt.Sprintf("zuedocs %s rollout%s", resolved, mode), results)
}

func runSmoke(ctx context.Context, args []string) error {
	flags := flag.NewFlagSet("smoke", flag.ContinueOnError)
	common := addFleetFlags(flags)
	tarball := flags.String("tarball", "", "packed zuedocs tarball to build against (from `npm pack`)")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if *tarball == "" {
		return errors.New("smoke needs --tarball (create one with `npm pack`)")
	}
	abs, err := filepath.Abs(*tarball)
	if err != nil {
		return err
	}
	if _, err := os.Stat(abs); err != nil {
		return err
	}
	runner, repos, cleanup, err := common.setup(ctx)
	if err != nil {
		return err
	}
	defer cleanup()

	fmt.Printf("Building %d repositories against %s\n\n", len(repos), filepath.Base(abs))
	results := runner.Smoke(ctx, repos, abs)
	return finish("zuedocs smoke build: "+filepath.Base(abs), results)
}

func finish(title string, results []fleet.Result) error {
	summary := fleet.MarkdownSummary(title, results)
	fleet.WriteStepSummary(summary)
	fmt.Printf("\n%s\n", fleet.Summarize(results))

	var flagged []string
	for _, result := range results {
		if result.Status.NeedsAttention() {
			flagged = append(flagged, fmt.Sprintf("  %s: %s (log: %s)", result.Repo.Name, result.Status, result.Log))
		}
	}
	if len(flagged) > 0 {
		return needsAttention(fmt.Sprintf("\n%d repositories need attention:\n%s", len(flagged), strings.Join(flagged, "\n")))
	}
	return nil
}

// reorder moves flags ahead of positional arguments, so "upgrade docs
// --version 0.1.30" works like "upgrade --version 0.1.30 docs".
func reorder(args []string) []string {
	var flags, positional []string
	for i := 0; i < len(args); i++ {
		arg := args[i]
		if arg == "--" {
			positional = append(positional, args[i+1:]...)
			break
		}
		if strings.HasPrefix(arg, "-") {
			flags = append(flags, arg)
			if !strings.Contains(arg, "=") && i+1 < len(args) && !isBoolFlag(arg) {
				flags = append(flags, args[i+1])
				i++
			}
			continue
		}
		positional = append(positional, arg)
	}
	return append(flags, positional...)
}

func isBoolFlag(arg string) bool {
	switch strings.TrimLeft(arg, "-") {
	case "no-verify", "dry-run", "keep", "h", "help":
		return true
	}
	return false
}
