import SwiftUI
import UIKit

// MARK: - People View
// Registered people shown as large, easy-to-read cards.

struct PeopleView: View {
    @State private var settings = AppSettings.shared
    @State private var peopleStore = PeopleStore.shared
    @State private var people: [Person] = Person.samplePeople
    @State private var showAddPerson = false
    @State private var personToRemove: Person?
    @State private var showRemoveConfirmation = false
    @State private var newPersonName = ""
    @State private var newPersonRelationship = ""

    var body: some View {
        ZStack(alignment: .bottomTrailing) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
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

                    if peopleStore.isLoading && !settings.isMockMode {
                        ProgressView("Loading people...")
                            .frame(maxWidth: .infinity, alignment: .center)
                            .padding(.horizontal, 24)
                    } else if let errorMessage = peopleStore.errorMessage, !settings.isMockMode {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Couldn’t load people from the desktop.")
                                .font(.system(size: settings.fontSize.bodySize, weight: .semibold))
                                .foregroundStyle(EmoryTheme.textPrimary)
                            Text(errorMessage)
                                .font(.system(size: settings.fontSize.captionSize))
                                .foregroundStyle(EmoryTheme.textSecondary)
                            Button("Retry") {
                                Task { await peopleStore.loadPeople() }
                            }
                            .font(.system(size: settings.fontSize.captionSize, weight: .semibold))
                            .foregroundStyle(EmoryTheme.primary)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(20)
                        .emoryCard()
                        .padding(.horizontal, 24)
                    } else {
                        VStack(spacing: 14) {
                            ForEach(people) { person in
                                NavigationLink(destination: PersonDetailView(person: person)) {
                                    PersonCardView(person: person, fontSize: settings.fontSize)
                                }
                                .buttonStyle(.plain)
                                .contextMenu {
                                    if settings.isMockMode {
                                        Button(role: .destructive) {
                                            personToRemove = person
                                            showRemoveConfirmation = true
                                        } label: {
                                            Label("Remove", systemImage: "person.badge.minus")
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 24)
                        .padding(.bottom, 80)
                    }

                    Group {
                        if settings.isMockMode {
                            Text("Mock mode is on. Turn it off in Settings to load people from the desktop database.")
                        } else {
                            Text("Showing people from the desktop SQLite database.")
                        }
                    }
                    .font(.system(size: settings.fontSize.captionSize))
                    .foregroundStyle(EmoryTheme.textSecondary)
                    .padding(.horizontal, 24)
                    .padding(.top, 4)
                }
            }
            .background(EmoryTheme.background.ignoresSafeArea())

            if settings.isMockMode {
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
        .task(id: "\(settings.isMockMode)-\(settings.backendURL)") {
            await peopleStore.loadPeople()
            people = settings.isMockMode ? Person.samplePeople : peopleStore.people
        }
        .onChange(of: peopleStore.people) { _, newValue in
            if !settings.isMockMode {
                people = newValue
            }
        }
    }
}

struct PersonCardView: View {
    let person: Person
    let fontSize: EmoryTheme.FontSize

    private var accentColor: Color {
        EmoryTheme.relationshipColor(for: person.relationship)
    }

    var body: some View {
        VStack(spacing: 0) {
            accentColor
                .frame(height: 4)

            VStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(accentColor.opacity(0.08))
                        .frame(width: 120, height: 120)

                    if let photoAsset = person.photoName,
                       UIImage(named: photoAsset) != nil {
                        Image(photoAsset)
                            .resizable()
                            .aspectRatio(contentMode: .fill)
                            .frame(width: 110, height: 110)
                            .clipShape(Circle())
                    } else {
                        FaceThumbnailView(
                            faceThumbnail: person.faceThumbnail,
                            fallbackSystemImage: "person.circle.fill",
                            size: 110
                        )
                    }
                }

                Text(person.name)
                    .font(.system(size: fontSize.bodySize, weight: .bold))
                    .foregroundStyle(EmoryTheme.textPrimary)

                Text(person.relationship)
                    .font(.system(size: fontSize.captionSize, weight: .medium))
                    .foregroundStyle(accentColor)

                if let lastSeen = person.lastSeen, !lastSeen.isEmpty {
                    HStack(spacing: 4) {
                        Image(systemName: "clock")
                            .font(.system(size: 11))
                        Text("Last seen \(lastSeen)")
                            .font(.system(size: fontSize.captionSize - 2))
                    }
                    .foregroundStyle(EmoryTheme.textSecondary)
                    .padding(.top, 2)
                }
            }
            .padding(.vertical, 24)
        }
        .frame(maxWidth: .infinity)
        .emoryCardElevated()
    }
}

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
