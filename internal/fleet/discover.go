package fleet

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"sort"
	"strings"
	"sync"
)

// FindDependents scans the owner's repositories for a package.json that
// depends on zuedocs. It reads each repository's file tree instead of using
// code search, which misses many repositories.
func (g *GitHub) FindDependents(ctx context.Context, owner string) ([]Repo, error) {
	all, err := g.AccessibleRepos(ctx)
	if err != nil {
		return nil, err
	}
	var candidates []Repo
	for _, repo := range all {
		if strings.EqualFold(repo.Owner, owner) && !repo.Archived && !strings.EqualFold(repo.Name, PackageName) {
			candidates = append(candidates, repo)
		}
	}

	var (
		mu    sync.Mutex
		found []Repo
		first error
		wg    sync.WaitGroup
		slots = make(chan struct{}, 8)
	)
	for _, repo := range candidates {
		wg.Add(1)
		go func() {
			defer wg.Done()
			slots <- struct{}{}
			defer func() { <-slots }()
			ok, err := g.dependsOnZuedocs(ctx, repo)
			mu.Lock()
			defer mu.Unlock()
			if err != nil && first == nil {
				first = fmt.Errorf("%s: %w", repo.FullName(), err)
			}
			if ok {
				found = append(found, repo)
			}
		}()
	}
	wg.Wait()
	sort.Slice(found, func(i, j int) bool { return found[i].Name < found[j].Name })
	return found, first
}

func (g *GitHub) dependsOnZuedocs(ctx context.Context, repo Repo) (bool, error) {
	var tree struct {
		Tree []struct {
			Path string `json:"path"`
			Type string `json:"type"`
		} `json:"tree"`
	}
	ref := url.PathEscape(repo.DefaultBranch)
	if err := g.do(ctx, http.MethodGet, fmt.Sprintf("/repos/%s/git/trees/%s?recursive=1", repo.FullName(), ref), nil, &tree); err != nil {
		var apiErr *apiError
		if asAPIError(err, &apiErr) && (apiErr.Status == http.StatusConflict || apiErr.Status == http.StatusNotFound) {
			return false, nil // empty repository
		}
		return false, err
	}
	for _, entry := range tree.Tree {
		if entry.Type != "blob" || path.Base(entry.Path) != "package.json" || skippedPath(entry.Path) {
			continue
		}
		var file struct {
			Content string `json:"content"`
		}
		contentsPath := fmt.Sprintf("/repos/%s/contents/%s?ref=%s", repo.FullName(), escapePath(entry.Path), ref)
		if err := g.do(ctx, http.MethodGet, contentsPath, nil, &file); err != nil {
			return false, err
		}
		data, err := base64.StdEncoding.DecodeString(strings.ReplaceAll(file.Content, "\n", ""))
		if err != nil {
			return false, err
		}
		var pkg packageJSON
		if json.Unmarshal(data, &pkg) != nil || pkg.Name == PackageName {
			continue
		}
		if pkg.Dependencies[PackageName] != "" || pkg.DevDependencies[PackageName] != "" {
			return true, nil
		}
	}
	return false, nil
}

func skippedPath(file string) bool {
	for _, part := range strings.Split(path.Dir(file), "/") {
		if skippedDirs[part] || (strings.HasPrefix(part, ".") && part != ".") {
			return true
		}
	}
	return false
}

func escapePath(file string) string {
	parts := strings.Split(file, "/")
	for i, part := range parts {
		parts[i] = url.PathEscape(part)
	}
	return strings.Join(parts, "/")
}
