import SwiftUI

// MARK: - Person Detail View
// Shows a person's photo, name, relationship, and memory notes.
// Designed with large text and warm styling for dementia patients.

struct PersonDetailView: View {
    let person: Person
    @State private var settings = AppSettings.shared
    @State private var showAddNote = false
    @State private var newNoteTitle = ""
    @State private var newNoteSubtitle = ""
    @State private var showRemoveConfirmation = false
    @State private var showEnrollConfirmation = false

    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                // Large photo header
                ZStack {
                    Rectangle()
                        .fill(EmoryTheme.primary.opacity(0.1))
                        .frame(height: 260)

                    Image(systemName: person.photoName ?? "person.circle.fill")
                        .font(.system(size: 100))
                        .foregroundStyle(EmoryTheme.primary.opacity(0.5))
                }

                // Name and relationship
                VStack(spacing: 4) {
                    Text(person.name)
                        .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    Text(person.relationship)
                        .font(.system(size: settings.fontSize.bodySize))
                        .foregroundStyle(EmoryTheme.primary)
                }
                .padding(.top, 20)
                .padding(.bottom, 24)

                // Memory Notes
                VStack(alignment: .leading, spacing: 16) {
                    Text("Memory Notes")
                        .font(.system(size: settings.fontSize.titleSize, weight: .semibold))
                        .foregroundStyle(EmoryTheme.textPrimary)
                        .padding(.horizontal, 24)

                    ForEach(person.memoryNotes) { note in
                        HStack(alignment: .top, spacing: 14) {
                            ZStack {
                                Circle()
                                    .fill(noteColor(for: note.icon).opacity(0.15))
                                    .frame(width: 40, height: 40)
                                Image(systemName: note.icon)
                                    .font(.system(size: 16))
                                    .foregroundStyle(noteColor(for: note.icon))
                            }

                            VStack(alignment: .leading, spacing: 2) {
                                Text(note.title)
                                    .font(.system(size: settings.fontSize.bodySize, weight: .medium))
                                    .foregroundStyle(EmoryTheme.textPrimary)
                                if let subtitle = note.subtitle {
                                    Text(subtitle)
                                        .font(.system(size: settings.fontSize.captionSize))
                                        .foregroundStyle(EmoryTheme.textSecondary)
                                }
                            }

                            Spacer()
                        }
                        .padding(.horizontal, 24)
                    }
                }
                .padding(.bottom, 24)

                // Action buttons
                VStack(spacing: 12) {
                    // Add Note
                    Button {
                        showAddNote = true
                    } label: {
                        HStack {
                            Image(systemName: "plus.circle.fill")
                            Text("Add Note")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                        }
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(EmoryTheme.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }

                    // Enroll Face
                    Button {
                        showEnrollConfirmation = true
                    } label: {
                        HStack {
                            Image(systemName: "faceid")
                            Text("Enroll Face")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                        }
                        .foregroundStyle(EmoryTheme.primary)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(EmoryTheme.primary.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                        .overlay(
                            RoundedRectangle(cornerRadius: 14)
                                .stroke(EmoryTheme.primary.opacity(0.3), lineWidth: 1)
                        )
                    }

                    // Remove Person
                    Button {
                        showRemoveConfirmation = true
                    } label: {
                        HStack {
                            Image(systemName: "person.badge.minus")
                            Text("Remove Person")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                        }
                        .foregroundStyle(EmoryTheme.destructive)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(EmoryTheme.destructive.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
        .background(EmoryTheme.background.ignoresSafeArea())
        .navigationTitle("About \(person.name)")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Are you sure you want to remove \(person.name)?",
            isPresented: $showRemoveConfirmation,
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {}
            Button("Keep", role: .cancel) {}
        } message: {
            Text("This will remove them from your circle. You can always add them back later.")
        }
        .alert("Enroll Face", isPresented: $showEnrollConfirmation) {
            Button("Start Enrollment") {
                // TODO: POST /enroll with person.id
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will register \(person.name)'s face so the glasses can recognize them. Make sure they're in front of the camera.")
        }
        .sheet(isPresented: $showAddNote) {
            AddNoteSheet(
                title: $newNoteTitle,
                subtitle: $newNoteSubtitle,
                fontSize: settings.fontSize
            ) {
                // Note: In a real app, this would persist
                newNoteTitle = ""
                newNoteSubtitle = ""
                showAddNote = false
            }
        }
    }

    private func noteColor(for icon: String) -> Color {
        if icon.contains("map") || icon.contains("house") { return EmoryTheme.primary }
        if icon.contains("person") { return EmoryTheme.secondary }
        if icon.contains("gift") || icon.contains("heart") { return EmoryTheme.destructive }
        if icon.contains("phone") || icon.contains("clock") { return EmoryTheme.primary }
        return EmoryTheme.secondary
    }
}

// MARK: - Add Note Sheet

struct AddNoteSheet: View {
    @Binding var title: String
    @Binding var subtitle: String
    let fontSize: EmoryTheme.FontSize
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("What would you like to remember?")
                        .font(.system(size: fontSize.bodySize, weight: .medium))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    TextField("e.g. Loves gardening", text: $title)
                        .font(.system(size: fontSize.bodySize))
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Any extra details? (optional)")
                        .font(.system(size: fontSize.bodySize, weight: .medium))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    TextField("e.g. Roses are her favorite", text: $subtitle)
                        .font(.system(size: fontSize.bodySize))
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Button {
                    onSave()
                } label: {
                    Text("Save Note")
                        .font(.system(size: fontSize.bodySize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(title.isEmpty ? Color.gray : EmoryTheme.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(title.isEmpty)

                Spacer()
            }
            .padding(24)
            .background(EmoryTheme.background.ignoresSafeArea())
            .navigationTitle("Add Memory Note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
