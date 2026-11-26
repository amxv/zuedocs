package fleet

import (
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// PackageName is the npm package every consumer site depends on.
const PackageName = "zuedocs"

// Directories never searched for consumer sites.
var skippedDirs = map[string]bool{
	".git": true, "node_modules": true, "dist": true, ".astro": true, ".vercel": true,
	"target": true, "vendor": true, "tmp": true, ".next": true, "build": true,
}

// Site is one Astro docs app inside a repository that depends on zuedocs.
type Site struct {
	// Dir is the absolute directory holding the site's package.json.
	Dir string
	// RelDir is Dir relative to the repository root ("." for a root site).
	RelDir string
	// Spec is the current zuedocs dependency spec, such as "0.1.26" or "^0.1.26".
	Spec string
	// Field is "dependencies" or "devDependencies".
	Field string
	// Manager installs dependencies, from InstallDir.
	Manager    PackageManager
	InstallDir string
	// CheckScript and BuildScript are package.json script names, empty when missing.
	CheckScript string
	BuildScript string
}

type packageJSON struct {
	Name            string            `json:"name"`
	Scripts         map[string]string `json:"scripts"`
	Dependencies    map[string]string `json:"dependencies"`
	DevDependencies map[string]string `json:"devDependencies"`
}

// Script names tried in order. Sites that live in a repository's root package
// (beside a CLI or library) use docs:* names, so those win over the generic ones.
var (
	checkScripts = []string{"docs:check", "check", "typecheck"}
	buildScripts = []string{"docs:build", "build"}
)

// FindSites returns every package.json under root that depends on zuedocs.
func FindSites(root string) ([]Site, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	var sites []Site
	err = filepath.WalkDir(root, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			if path != root && (skippedDirs[entry.Name()] || strings.HasPrefix(entry.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		if entry.Name() != "package.json" {
			return nil
		}
		site, ok, err := readSite(root, filepath.Dir(path))
		if err != nil {
			return fmt.Errorf("%s: %w", path, err)
		}
		if ok {
			sites = append(sites, site)
		}
		return nil
	})
	sort.Slice(sites, func(i, j int) bool { return sites[i].RelDir < sites[j].RelDir })
	return sites, err
}

func readSite(root, dir string) (Site, bool, error) {
	data, err := os.ReadFile(filepath.Join(dir, "package.json"))
	if err != nil {
		return Site{}, false, err
	}
	var pkg packageJSON
	if err := json.Unmarshal(data, &pkg); err != nil {
		return Site{}, false, err
	}
	if pkg.Name == PackageName {
		return Site{}, false, nil
	}
	field, spec := "dependencies", pkg.Dependencies[PackageName]
	if spec == "" {
		field, spec = "devDependencies", pkg.DevDependencies[PackageName]
	}
	if spec == "" {
		return Site{}, false, nil
	}

	rel, err := filepath.Rel(root, dir)
	if err != nil {
		return Site{}, false, err
	}
	manager, installDir := DetectPackageManager(root, dir)
	return Site{
		Dir:         dir,
		RelDir:      filepath.ToSlash(rel),
		Spec:        spec,
		Field:       field,
		Manager:     manager,
		InstallDir:  installDir,
		CheckScript: firstScript(pkg.Scripts, checkScripts),
		BuildScript: firstScript(pkg.Scripts, buildScripts),
	}, true, nil
}

func firstScript(scripts map[string]string, names []string) string {
	for _, name := range names {
		if strings.TrimSpace(scripts[name]) != "" {
			return name
		}
	}
	return ""
}

// PackageManager knows how to install and run scripts for one lockfile type.
type PackageManager struct {
	Name     string
	Lockfile string
}

var packageManagers = []PackageManager{
	{Name: "bun", Lockfile: "bun.lock"},
	{Name: "bun", Lockfile: "bun.lockb"},
	{Name: "pnpm", Lockfile: "pnpm-lock.yaml"},
	{Name: "yarn", Lockfile: "yarn.lock"},
	{Name: "npm", Lockfile: "package-lock.json"},
}

// DetectPackageManager walks up from dir to root and returns the package
// manager of the nearest lockfile, plus the directory to install from. A
// workspace site (lockfile in a parent) installs from the workspace root.
// Bun wins when one directory has several lockfiles. Without any lockfile the
// site is installed with Bun from its own directory.
func DetectPackageManager(root, dir string) (PackageManager, string) {
	for current := dir; ; current = filepath.Dir(current) {
		for _, manager := range packageManagers {
			if _, err := os.Stat(filepath.Join(current, manager.Lockfile)); err == nil {
				return manager, current
			}
		}
		if current == root || current == filepath.Dir(current) || !strings.HasPrefix(current, root) {
			break
		}
	}
	return PackageManager{Name: "bun", Lockfile: "bun.lock"}, dir
}

// InstallCommand installs the workspace's dependencies.
func (m PackageManager) InstallCommand() []string {
	switch m.Name {
	case "npm":
		return []string{"npm", "install", "--no-audit", "--no-fund"}
	case "pnpm":
		return []string{"pnpm", "install"}
	case "yarn":
		return []string{"yarn", "install"}
	default:
		return []string{"bun", "install"}
	}
}

// RunCommand runs a package.json script.
func (m PackageManager) RunCommand(script string) []string {
	return []string{m.Name, "run", script}
}

// Local specs point at a checkout or tarball and are never rewritten.
var localSpec = regexp.MustCompile(`^(file|link|workspace|portal|git\+?[a-z]*|https?):`)

// NextSpec returns the dependency spec for target, keeping a ^ or ~ range
// prefix. A target that is already a full spec (file:...) is used as is.
func NextSpec(current, target string) (string, error) {
	if localSpec.MatchString(current) {
		return "", fmt.Errorf("zuedocs is installed from %q, not from npm", current)
	}
	if strings.Contains(target, ":") {
		return target, nil
	}
	if strings.HasPrefix(current, "^") || strings.HasPrefix(current, "~") {
		return current[:1] + target, nil
	}
	return target, nil
}

// SetSpec rewrites the zuedocs dependency in package.json without touching
// the rest of the file's formatting.
func SetSpec(site Site, spec string) error {
	path := filepath.Join(site.Dir, "package.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	pattern := regexp.MustCompile(`("` + regexp.QuoteMeta(PackageName) + `"\s*:\s*")` + regexp.QuoteMeta(site.Spec) + `"`)
	matches := pattern.FindAllIndex(data, -1)
	if len(matches) != 1 {
		return errors.New("could not find exactly one zuedocs dependency to rewrite in " + path)
	}
	escaped, err := json.Marshal(spec)
	if err != nil {
		return err
	}
	updated := pattern.ReplaceAll(data, []byte("${1}"+strings.ReplaceAll(string(escaped[1:len(escaped)-1]), "$", "$$")+`"`))
	return os.WriteFile(path, updated, 0o644)
}

// ChangedFiles lists the files an upgrade is allowed to commit: each site's
// package.json and the lockfile it installs with.
func ChangedFiles(root string, sites []Site) []string {
	seen := map[string]bool{}
	var files []string
	add := func(path string) {
		rel, err := filepath.Rel(root, path)
		if err != nil || seen[rel] {
			return
		}
		seen[rel] = true
		files = append(files, filepath.ToSlash(rel))
	}
	for _, site := range sites {
		add(filepath.Join(site.Dir, "package.json"))
		add(filepath.Join(site.InstallDir, site.Manager.Lockfile))
	}
	sort.Strings(files)
	return files
}
