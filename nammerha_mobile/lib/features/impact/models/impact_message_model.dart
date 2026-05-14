class ImpactMessage {
  final String id;
  final String funderId;
  final String? projectId;
  final String title;
  final String body;
  final String? imageUrl;
  final bool isRead;
  final DateTime createdAt;
  final String type; // e.g. 'milestone', 'completion', 'thank_you'

  const ImpactMessage({
    required this.id,
    required this.funderId,
    this.projectId,
    required this.title,
    required this.body,
    this.imageUrl,
    required this.isRead,
    required this.createdAt,
    required this.type,
  });

  factory ImpactMessage.fromJson(Map<String, dynamic> json) {
    return ImpactMessage(
      id: json['id']?.toString() ?? '',
      funderId: json['donor_id']?.toString() ?? '', // Backend contract key
      projectId: json['project_id']?.toString(),
      title: json['title']?.toString() ?? '',
      body: json['body']?.toString() ?? '',
      imageUrl: json['image_url']?.toString(),
      isRead: json['is_read'] == true || json['is_read'] == 1,
      createdAt: json['created_at'] != null 
          ? DateTime.tryParse(json['created_at'].toString()) ?? DateTime.now()
          : DateTime.now(),
      type: json['type']?.toString() ?? 'general',
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'donor_id': funderId, // Backend contract key
      'project_id': projectId,
      'title': title,
      'body': body,
      'image_url': imageUrl,
      'is_read': isRead,
      'created_at': createdAt.toIso8601String(),
      'type': type,
    };
  }

  ImpactMessage copyWith({
    String? id,
    String? funderId,
    String? projectId,
    String? title,
    String? body,
    String? imageUrl,
    bool? isRead,
    DateTime? createdAt,
    String? type,
  }) {
    return ImpactMessage(
      id: id ?? this.id,
      funderId: funderId ?? this.funderId,
      projectId: projectId ?? this.projectId,
      title: title ?? this.title,
      body: body ?? this.body,
      imageUrl: imageUrl ?? this.imageUrl,
      isRead: isRead ?? this.isRead,
      createdAt: createdAt ?? this.createdAt,
      type: type ?? this.type,
    );
  }
}
