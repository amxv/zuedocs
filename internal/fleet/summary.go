package fleet

import (
	"fmt"
	"os"
	"sort"
	"strings"
)

// Summarize counts results by status, in a stable order.
func Summarize(results []Result) string {
	counts := map[Status]int{}
	for _, result := range results {
		counts[result.Status]++
	}
	var statuses []string
	for status := range counts {
		statuses = append(statuses, string(status))
	}
	sort.Strings(statuses)
	var parts []string
	for _, status := range statuses {
		parts = append(parts, fmt.Sprintf("%d %s", counts[Status(status)], status))
	}
	return strings.Join(parts, ", ")
}

// MarkdownSummary renders results as a GitHub-flavored Markdown table.
func MarkdownSummary(title string, results []Result) string {
	var b strings.Builder
	fmt.Fprintf(&b, "## %s\n\n%s\n\n| Repository | Result | Site | Details |\n| --- | --- | --- | --- |\n", title, Summarize(results))
	ordered := append([]Result(nil), results...)
	sort.SliceStable(ordered, func(i, j int) bool {
		if ordered[i].Status.NeedsAttention() != ordered[j].Status.NeedsAttention() {
			return ordered[i].Status.NeedsAttention()
		}
		return ordered[i].Repo.Name < ordered[j].Repo.Name
	})
	for _, result := range ordered {
		details := []string{}
		if result.From != "" {
			details = append(details, "from "+result.From)
		}
		if result.Detail != "" {
			details = append(details, result.Detail)
		}
		if result.URL != "" {
			details = append(details, fmt.Sprintf("[pull request](%s)", result.URL))
		}
		if result.Note != "" {
			details = append(details, result.Note)
		}
		fmt.Fprintf(&b, "| [%s](https://github.com/%s) | %s | %s | %s |\n",
			result.Repo.Name, result.Repo.FullName(), result.Status,
			cell(strings.Join(result.Sites, ", ")), cell(strings.Join(details, "; ")))
	}
	return b.String()
}

func cell(value string) string {
	value = strings.ReplaceAll(value, "|", "\\|")
	return strings.ReplaceAll(value, "\n", " ")
}

// WriteStepSummary appends Markdown to the GitHub Actions job summary.
func WriteStepSummary(markdown string) {
	path := os.Getenv("GITHUB_STEP_SUMMARY")
	if path == "" {
		return
	}
	file, err := os.OpenFile(path, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return
	}
	defer file.Close()
	_, _ = file.WriteString(markdown + "\n")
}
