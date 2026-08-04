package handlers

import "testing"

func TestParseCUIT(t *testing.T) {
	casos := []struct {
		in   string
		want int64
	}{
		{"20-12345678-9", 20123456789}, // con guiones
		{"20123456789", 20123456789},   // ya limpio
		{"27 12345678 4", 27123456784}, // con espacios
		{"", 0},                        // vacío
	}
	for _, c := range casos {
		if got := parseCUIT(c.in); got != c.want {
			t.Errorf("parseCUIT(%q) = %d, esperaba %d", c.in, got, c.want)
		}
	}
}
