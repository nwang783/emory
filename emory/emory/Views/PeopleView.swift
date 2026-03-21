import SwiftUI

// MARK: - People View
// Grid of enrolled people shown as large photo cards.
// Designed for easy recognition with big photos and names.

struct PeopleView: View {
    @State private var settings = AppSettings.shared
    @State private var people: [Person] = Person.samplePeople
    @State private var showAddPerson = false
    @State private var personToRemove: Person?
    @State private var showRemoveConfirmation = false
    @State private var newPersonName = ""
    @State private var newPersonRelationship = ""

    private let columns = [
        GridItem(.flexible(), spacing: 16),
        GridItem(.flexible(), spacing: 16)
    ]

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    // Header text
                    VStack(alignment: .leading, spacing: 4) {
                        Text("My Circle")
                            .font(.system(size: settings.fontSize.headlineSize, weight: .bold))
                            .foregroundStyle(EmoryTheme.textPrimary)
                        Text("The people who matter most, always here for you.")
                            .font(.system(size: settings.fontSize.captionSize))
                            .foregroundStyle(EmoryTheme.textSecondary)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)

                    // People grid
                    LazyVGrid(columns: columns, spacing: 20) {
                        ForEach(people) { person in
                            NavigationLink(destination: PersonDetailView(person: person)) {
                                PersonCardView(person: person, fontSize: settings.fontSize)
                            }
                            .contextMenu {
                                Button(role: .destructive) {
                                    personToRemove = person
                                    showRemoveConfirmation = true
                                } label: {
                                    Label("Remove", systemImage: "person.badge.minus")
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                    .padding(.bottom, 80)
                }
            }
            .background(EmoryTheme.background.ignoresSafeArea())

            // Floating add button
            Button {
                showAddPerson = true
            } label: {
                Image(systemName: "plus")
                    .font(.title2.bold())
                    .foregroundStyle(.white)
                    .frame(width: 56, height: 56)
                    .background(EmoryTheme.primary)
                    .clipShape(Circle())
                    .shadow(color: EmoryTheme.primary.opacity(0.3), radius: 8, y: 4)
            }
            .padding(.trailing, 24)
            .padding(.bottom, 24)
        }
        .navigationTitle("People")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog(
            "Are you sure you want to remove \(personToRemove?.name ?? "this person")?",
            isPresented: $showRemoveConfirmation,
            titleVisibility: .visible
        ) {
            Button("Remove", role: .destructive) {
                if let person = personToRemove {
                    withAnimation(.easeInOut(duration: 0.3)) {
                        people.removeAll { $0.id == person.id }
                    }
                }
            }
            Button("Keep", role: .cancel) {}
        } message: {
            Text("This will remove them from your circle. You can always add them back later.")
        }
        .sheet(isPresented: $showAddPerson) {
            AddPersonSheet(
                name: $newPersonName,
                relationship: $newPersonRelationship,
                fontSize: settings.fontSize
            ) {
                let person = Person(name: newPersonName, relationship: newPersonRelationship)
                withAnimation(.easeInOut(duration: 0.3)) {
                    people.append(person)
                }
                newPersonName = ""
                newPersonRelationship = ""
                showAddPerson = false
            }
        }
    }
}

// MARK: - Person Card

struct PersonCardView: View {
    let person: Person
    let fontSize: EmoryTheme.FontSize

    var body: some View {
        VStack(spacing: 8) {
            // Photo placeholder
            ZStack {
                Circle()
                    .fill(EmoryTheme.primary.opacity(0.1))
                    .frame(width: 90, height: 90)
                Image(systemName: person.photoName ?? "person.circle.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(EmoryTheme.primary.opacity(0.6))
            }

            Text(person.name)
                .font(.system(size: fontSize.bodySize, weight: .semibold))
                .foregroundStyle(EmoryTheme.textPrimary)

            Text(person.relationship)
                .font(.system(size: fontSize.captionSize))
                .foregroundStyle(EmoryTheme.primary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .emoryCard()
    }
}

// MARK: - Add Person Sheet

struct AddPersonSheet: View {
    @Binding var name: String
    @Binding var relationship: String
    let fontSize: EmoryTheme.FontSize
    let onSave: () -> Void

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Name")
                        .font(.system(size: fontSize.bodySize, weight: .medium))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    TextField("Enter their name", text: $name)
                        .font(.system(size: fontSize.bodySize))
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Relationship")
                        .font(.system(size: fontSize.bodySize, weight: .medium))
                        .foregroundStyle(EmoryTheme.textPrimary)
                    TextField("e.g. Your Daughter", text: $relationship)
                        .font(.system(size: fontSize.bodySize))
                        .padding()
                        .background(Color(.systemGray6))
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }

                Button {
                    onSave()
                } label: {
                    Text("Add to My Circle")
                        .font(.system(size: fontSize.bodySize, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(name.isEmpty ? Color.gray : EmoryTheme.secondary)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .disabled(name.isEmpty)

                Spacer()
            }
            .padding(24)
            .background(EmoryTheme.background.ignoresSafeArea())
            .navigationTitle("Add Person")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }
}
