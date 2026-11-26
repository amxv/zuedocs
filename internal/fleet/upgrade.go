package fleet

import (
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// StepTimeout bounds each install, check, or build command.
const StepTimeout = 20 * time.Minute

// Environment variables removed before running a consumer's own scripts, so
// install hooks and builds never see the fleet's GitHub or npm credentials.
var secretEnv = []string{"GH_TOKEN", "GITHUB_TOKEN", "ZUEDOCS_FLEET_TOKEN", "NODE_AUTH_TOKEN", "NPM_TOKEN"}

// StepError reports which step of an upgrade failed and where.
type StepError struct {
	Step string // "edit", "install", "check", or "build"
	Dir  string // site directory relative to the repository root
	Err  error
}

func (e *StepError) Error() string {
	return fmt.Sprintf("%s failed in %s: %v", e.Step, e.Dir, e.Err)
}

func (e *StepError) Unwrap() error { return e.Err }

// UpgradeOptions controls Upgrade.
type UpgradeOptions struct {
	// Target is a version ("0.1.30") or a full spec ("file:/tmp/zuedocs.tgz").
	Target string
	// Verify runs each site's check and build scripts after installing.
	Verify bool
	// Log receives command output.
	Log io.Writer
}

// UpgradeResult describes what Upgrade changed.
type UpgradeResult struct {
	Sites   []Site
	Changed []Site // sites whose spec was rewritten
	From    []string
}

// Upgrade rewrites every zuedocs dependency under root to the target,
// installs, and optionally checks and builds each site. It never commits.
func Upgrade(ctx context.Context, root string, options UpgradeOptions) (UpgradeResult, error) {
	sites, err := FindSites(root)
	if err != nil {
		return UpgradeResult{}, err
	}
	result := UpgradeResult{Sites: sites}
	if len(sites) == 0 {
		return result, nil
	}

	for _, site := range sites {
		spec, err := NextSpec(site.Spec, options.Target)
		if err != nil {
			return result, &StepError{Step: "edit", Dir: site.RelDir, Err: err}
		}
		if spec == site.Spec {
			continue
		}
		if err := SetSpec(site, spec); err != nil {
			return result, &StepError{Step: "edit", Dir: site.RelDir, Err: err}
		}
		fmt.Fprintf(options.Log, "==> %s: zuedocs %s -> %s\n", site.RelDir, site.Spec, spec)
		result.From = append(result.From, site.Spec)
		site.Spec = spec
		result.Changed = append(result.Changed, site)
	}
	if len(result.Changed) == 0 {
		return result, nil
	}

	if err := InstallAndVerify(ctx, root, result.Changed, options.Verify, options.Log); err != nil {
		return result, err
	}
	return result, nil
}

// InstallAndVerify installs each distinct workspace once, then runs each
// site's check and build scripts.
func InstallAndVerify(ctx context.Context, root string, sites []Site, verify bool, log io.Writer) error {
	installed := map[string]bool{}
	for _, site := range sites {
		if installed[site.InstallDir] {
			continue
		}
		installed[site.InstallDir] = true
		if err := runStep(ctx, site.InstallDir, site.Manager.InstallCommand(), log); err != nil {
			return &StepError{Step: "install", Dir: relDir(root, site.InstallDir), Err: err}
		}
	}
	if !verify {
		return nil
	}
	for _, site := range sites {
		if site.CheckScript != "" {
			if err := runStep(ctx, site.Dir, site.Manager.RunCommand(site.CheckScript), log); err != nil {
				return &StepError{Step: "check", Dir: site.RelDir, Err: err}
			}
		}
		if site.BuildScript == "" {
			return &StepError{Step: "build", Dir: site.RelDir, Err: errors.New("package.json has no docs:build or build script")}
		}
		if err := runStep(ctx, site.Dir, site.Manager.RunCommand(site.BuildScript), log); err != nil {
			return &StepError{Step: "build", Dir: site.RelDir, Err: err}
		}
	}
	return nil
}

func relDir(root, dir string) string {
	rel, err := filepath.Rel(root, dir)
	if err != nil {
		return dir
	}
	return filepath.ToSlash(rel)
}

func runStep(ctx context.Context, dir string, args []string, log io.Writer) error {
	ctx, cancel := context.WithTimeout(ctx, StepTimeout)
	defer cancel()
	fmt.Fprintf(log, "\n$ %s  (in %s)\n", strings.Join(args, " "), dir)
	cmd := exec.CommandContext(ctx, args[0], args[1:]...)
	cmd.Dir = dir
	cmd.Stdout = log
	cmd.Stderr = log
	cmd.Env = append(scrubbedEnv(), "CI=1", "ASTRO_TELEMETRY_DISABLED=1", "FORCE_COLOR=0", "NO_COLOR=1")
	cmd.WaitDelay = 10 * time.Second
	if err := cmd.Run(); err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			return fmt.Errorf("timed out after %s", StepTimeout)
		}
		return err
	}
	return nil
}

func scrubbedEnv() []string {
	var env []string
outer:
	for _, entry := range os.Environ() {
		for _, name := range secretEnv {
			if strings.HasPrefix(entry, name+"=") {
				continue outer
			}
		}
		env = append(env, entry)
	}
	return env
}
