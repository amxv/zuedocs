package fleet

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func writeFiles(t *testing.T, files map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for name, content := range files {
		path := filepath.Join(root, name)
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestFindSites(t *testing.T) {
	root := writeFiles(t, map[string]string{
		// A workspace: the docs package has no lockfile of its own.
		"package.json":      `{"name":"tool","workspaces":["docs"],"scripts":{"build":"tsc"}}`,
		"bun.lock":          "{}",
		"docs/package.json": `{"name":"docs","scripts":{"check":"astro check","build":"astro build"},"dependencies":{"zuedocs":"0.1.26"}}`,
		// A standalone site with both lockfiles: Bun wins.
		"site/package.json":      `{"scripts":{"docs:check":"x","check":"y","docs:build":"z","build":"w"},"devDependencies":{"zuedocs":"^0.1.26"}}`,
		"site/bun.lock":          "{}",
		"site/package-lock.json": "{}",
		// Never searched.
		"docs/node_modules/zuedocs/package.json":      `{"name":"zuedocs"}`,
		"docs/node_modules/other/package.json":        `{"dependencies":{"zuedocs":"1.0.0"}}`,
		".agents/skills/example/package.json":         `{"dependencies":{"zuedocs":"1.0.0"}}`,
		"examples/zuedocs-itself/package.json":        `{"name":"zuedocs","dependencies":{"zuedocs":"file:."}}`,
		"examples/npm-site/package.json":              `{"scripts":{"typecheck":"astro check","build":"astro build"},"dependencies":{"zuedocs":"0.1.20"}}`,
		"examples/npm-site/package-lock.json":         "{}",
		"examples/unrelated/package.json":             `{"dependencies":{"astro":"7.0.0"}}`,
		"examples/unrelated/nested/dist/package.json": `{"dependencies":{"zuedocs":"1.0.0"}}`,
	})

	sites, err := FindSites(root)
	if err != nil {
		t.Fatal(err)
	}
	type summary struct {
		RelDir, Spec, Field, Manager, InstallDir, Check, Build string
	}
	var got []summary
	for _, site := range sites {
		got = append(got, summary{site.RelDir, site.Spec, site.Field, site.Manager.Name, relDir(root, site.InstallDir), site.CheckScript, site.BuildScript})
	}
	want := []summary{
		{"docs", "0.1.26", "dependencies", "bun", ".", "check", "build"},
		{"examples/npm-site", "0.1.20", "dependencies", "npm", "examples/npm-site", "typecheck", "build"},
		{"site", "^0.1.26", "devDependencies", "bun", "site", "docs:check", "docs:build"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("sites:\n got %+v\nwant %+v", got, want)
	}
}

func TestDetectPackageManagerDefaultsToBun(t *testing.T) {
	root := writeFiles(t, map[string]string{"docs/package.json": "{}"})
	manager, dir := DetectPackageManager(root, filepath.Join(root, "docs"))
	if manager.Name != "bun" || dir != filepath.Join(root, "docs") {
		t.Fatalf("got %s in %s", manager.Name, dir)
	}
}

func TestNextSpec(t *testing.T) {
	cases := []struct{ current, target, want string }{
		{"0.1.26", "0.1.30", "0.1.30"},
		{"^0.1.26", "0.1.30", "^0.1.30"},
		{"~0.1.26", "0.1.30", "~0.1.30"},
		{"^0.1.26", "file:/tmp/zuedocs.tgz", "file:/tmp/zuedocs.tgz"},
	}
	for _, c := range cases {
		got, err := NextSpec(c.current, c.target)
		if err != nil || got != c.want {
			t.Errorf("NextSpec(%q, %q) = %q, %v; want %q", c.current, c.target, got, err, c.want)
		}
	}
	if _, err := NextSpec("file:../zuedocs", "0.1.30"); err == nil {
		t.Error("a local file: spec should not be rewritten")
	}
}

func TestSetSpecKeepsFormatting(t *testing.T) {
	original := "{\n  \"name\": \"docs\",\n  \"dependencies\": {\n    \"astro\": \"^7.0.0\",\n    \"zuedocs\":   \"0.1.26\"\n  }\n}\n"
	root := writeFiles(t, map[string]string{"docs/package.json": original})
	site := Site{Dir: filepath.Join(root, "docs"), Spec: "0.1.26"}
	if err := SetSpec(site, "0.1.30"); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(filepath.Join(root, "docs", "package.json"))
	if want := strings.Replace(original, "0.1.26", "0.1.30", 1); string(data) != want {
		t.Fatalf("got\n%s\nwant\n%s", data, want)
	}
	site.Spec = "9.9.9"
	if err := SetSpec(site, "1.0.0"); err == nil {
		t.Fatal("expected an error when the current spec is not in the file")
	}
}

func TestChangedFiles(t *testing.T) {
	root := "/repo"
	sites := []Site{
		{Dir: "/repo/docs", InstallDir: "/repo", Manager: PackageManager{Name: "bun", Lockfile: "bun.lock"}},
		{Dir: "/repo/site", InstallDir: "/repo/site", Manager: PackageManager{Name: "npm", Lockfile: "package-lock.json"}},
	}
	got := ChangedFiles(root, sites)
	want := []string{"bun.lock", "docs/package.json", "site/package-lock.json", "site/package.json"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}
