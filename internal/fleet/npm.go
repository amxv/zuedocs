package fleet

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// RegistryURL is the npm registry the fleet reads published versions from.
var RegistryURL = "https://registry.npmjs.org"

type packument struct {
	DistTags map[string]string          `json:"dist-tags"`
	Versions map[string]json.RawMessage `json:"versions"`
}

func fetchPackument(ctx context.Context) (packument, error) {
	var doc packument
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, RegistryURL+"/"+PackageName, nil)
	if err != nil {
		return doc, err
	}
	// The abbreviated document is what Bun and npm resolve installs from, so
	// it is the one that has to list a new version before upgrades can run.
	req.Header.Set("Accept", "application/vnd.npm.install-v1+json")
	req.Header.Set("Cache-Control", "no-cache")
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return doc, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return doc, fmt.Errorf("npm registry returned %s", resp.Status)
	}
	return doc, json.NewDecoder(resp.Body).Decode(&doc)
}

// ResolveVersion turns "latest" (or "") into the published latest version.
func ResolveVersion(ctx context.Context, version string) (string, error) {
	if version != "" && version != "latest" {
		return version, nil
	}
	doc, err := fetchPackument(ctx)
	if err != nil {
		return "", err
	}
	latest := doc.DistTags["latest"]
	if latest == "" {
		return "", fmt.Errorf("npm has no latest version of %s", PackageName)
	}
	return latest, nil
}

// WaitForVersion polls the registry until the version is installable. A
// version that was just published can take a minute to show up everywhere.
func WaitForVersion(ctx context.Context, version string, timeout time.Duration, log func(string)) error {
	deadline := time.Now().Add(timeout)
	for attempt := 1; ; attempt++ {
		doc, err := fetchPackument(ctx)
		if err == nil {
			if _, ok := doc.Versions[version]; ok {
				return nil
			}
		}
		if time.Now().After(deadline) {
			if err != nil {
				return fmt.Errorf("%s@%s is not on npm after %s: %w", PackageName, version, timeout, err)
			}
			return fmt.Errorf("%s@%s is not on npm after %s", PackageName, version, timeout)
		}
		if attempt == 1 {
			log(fmt.Sprintf("Waiting for %s@%s to appear on npm", PackageName, version))
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(10 * time.Second):
		}
	}
}
